/**
 * Provider-agnostic LLM front door. Every AI feature (Jarvis, Physio chat,
 * LaunchKit generators) calls generateChat/generateStructured here instead of
 * talking to a provider directly, so the whole app shares one resilient chain:
 *
 *   Groq (llama-3.3-70b-versatile, free ~30 req/min)
 *     → NVIDIA NIM (openai/gpt-oss-20b)
 *       → any custom OpenAI-compatible endpoints the user added
 *         → Gemini (gemini-3.6-flash → gemini-3.5-flash, free ~20 req/day)
 *           → clear 429 error (never a silent failure)
 *
 * Per-minute free tiers lead the chain because the v3 root cause of "Jarvis
 * randomly broken" was Gemini's tiny daily cap.
 *
 * Since v5, each hop's key isn't a single fixed value — llm-keys.ts holds a
 * Firestore-backed pool per provider (Settings -> AI provider keys), so more
 * than one free-tier account can back the same provider with automatic
 * failover when one hits its limit. The GROQ_API_KEY/NVIDIA_API_KEY/
 * GEMINI_API_KEY env vars are the fallback when that provider's pool is
 * empty, kept so a deployment that predates the pool keeps working unchanged.
 */
import { getGeminiClient, GEMINI_CHAIN, isQuotaError, isOverloadError, GeminiError, extractJson } from './gemini';
import { activeKeysFor, coolDownKey, type LlmKey } from './llm-keys';

export { GeminiError, extractJson };

// meta/llama-4-maverick-17b-128e-instruct is gone from NVIDIA's catalog
// entirely — confirmed against the live, unauthenticated GET
// https://integrate.api.nvidia.com/v1/models, not just the 410 it started
// returning. openai/gpt-oss-20b is a real, currently-listed model on that
// same endpoint, picked for the same reasons the original was: fast (20B,
// not a slow dense giant) and strong at instruction-following/JSON.
export const NIM_MODEL = 'openai/gpt-oss-20b';

/**
 * Static shape for the two named OpenAI-compatible providers — url/model/
 * timeout are fixed per provider, only which KEY is used varies. `custom`
 * pool entries carry their own baseUrl+model instead (see resolveKeys).
 */
const PROVIDER_SHAPE = {
  groq: {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    // Groq no longer hosts Llama 4 Maverick; 3.3-70b is the best
    // conversational fit there (non-reasoning, strong JSON, ~300 tok/s).
    model: 'llama-3.3-70b-versatile',
    // At ~300 tok/s a full Jarvis reply takes a few seconds. 30s let one stalled request
    // hold every answer for half a minute before NIM/Gemini were even tried.
    timeoutMs: 10_000,
  },
  nvidia: {
    name: 'nim',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    model: NIM_MODEL,
    // A healthy NIM answers in 1-5s; when its edge drops the request
    // (observed from Vercel: /v1/models 200 in 13ms, chat POST never
    // returns, streamed or not) fail over fast instead of stalling.
    timeoutMs: 10_000,
  },
} as const;

/** One provider attempt, for callers that want to see where a slow answer spent its time. */
export interface LlmAttempt { provider: string; ms: number; ok: boolean; error?: string }

/**
 * Keys that just timed out or stalled sit out for a few minutes, so the next question goes
 * straight to a provider that is answering. Pool keys also get the Firestore cooldown on quota
 * errors (below); this in-memory list also covers env keys and timeouts, per warm instance.
 */
const STALLED_MS = 5 * 60_000;
const stalledUntil = new Map<string, number>();
function stallId(provider: string, keyId?: string, apiKey?: string): string {
  return provider + ':' + (keyId ?? (apiKey ? apiKey.slice(-6) : 'env'));
}
function isStalled(id: string): boolean {
  const until = stalledUntil.get(id);
  if (!until) return false;
  if (Date.now() > until) { stalledUntil.delete(id); return false; }
  return true;
}
function isTimeout(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  return !!e && (e.name === 'TimeoutError' || e.name === 'AbortError' || /timed? ?out|aborted|ETIMEDOUT|UND_ERR/i.test(String(e.message)));
}

interface ResolvedKey {
  keyId?: string; // present only for pool-sourced keys — cooldown targets these
  apiKey: string;
  provider: { name: string; url: string; model: string; timeoutMs: number };
}

/**
 * One provider's usable keys: the Firestore pool first (multiple keys,
 * automatic failover, addable from Settings with no redeploy), then the
 * single env var as a fallback so an empty pool never breaks a deployment
 * that predates this feature.
 */
async function resolveKeys(name: 'groq' | 'nvidia'): Promise<ResolvedKey[]> {
  const shape = PROVIDER_SHAPE[name];
  const pooled = await activeKeysFor(name);
  if (pooled.length) {
    return pooled.map((k) => ({ keyId: k.id, apiKey: k.key, provider: shape }));
  }
  const envKey = process.env[shape.envKey];
  return envKey ? [{ apiKey: envKey, provider: shape }] : [];
}

/** User-added arbitrary OpenAI-compatible endpoints — "any free key from anywhere". */
async function resolveCustomKeys(): Promise<ResolvedKey[]> {
  const pooled = await activeKeysFor('custom');
  return pooled
    .filter((k): k is LlmKey & { baseUrl: string; model: string } => !!k.baseUrl && !!k.model)
    .map((k) => ({
      keyId: k.id,
      apiKey: k.key,
      provider: { name: `custom:${k.label || k.id}`, url: k.baseUrl, model: k.model, timeoutMs: 20_000 },
    }));
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  system: string;
  messages: LlmMessage[];
  /** Ask the provider to emit a single JSON object. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Filled with one entry per provider tried (no keys), when given. */
  trace?: LlmAttempt[];
}

/**
 * Providers retire models (Groq's llama-3.3-70b-versatile now 404s, NIM's gpt-oss-20b 410s),
 * which silently left Jarvis on Gemini alone. When a provider says the model is gone, ask it
 * which models it has now, take the first match from this list, and remember it per instance.
 * GROQ_MODEL / NIM_MODEL_OVERRIDE env vars pin a model outright.
 */
const MODEL_PREFS: Record<string, RegExp[]> = {
  // fast, non-reasoning chat models first (Jarvis is spoken and must answer quickly)
  groq: [/^llama-3\.3-70b/, /llama-4-maverick/, /llama-4-scout/, /^openai\/gpt-oss-120b$/, /^qwen\/qwen3-32b$/, /^openai\/gpt-oss-20b$/, /llama.*70b/, /llama/],
  nim: [/^meta\/llama-3\.3-70b-instruct$/, /llama-4-maverick/, /^meta\/llama-3\.1-70b-instruct$/, /^openai\/gpt-oss-120b$/, /nemotron.*super/, /^openai\/gpt-oss-20b$/, /llama.*70b/],
};
const liveModel = new Map<string, string>();

function modelFor(provider: ResolvedKey['provider']): string {
  const pinned = provider.name === 'groq' ? process.env.GROQ_MODEL : provider.name === 'nim' ? process.env.NIM_MODEL_OVERRIDE : undefined;
  return pinned || liveModel.get(provider.name) || provider.model;
}

async function pickLiveModel(provider: ResolvedKey['provider'], apiKey: string): Promise<string | null> {
  const prefs = MODEL_PREFS[provider.name];
  if (!prefs) return null;
  try {
    const res = await fetch(provider.url.replace(/\/chat\/completions$/, '/models'), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const ids = (((await res.json()) as { data?: { id?: string }[] }).data ?? []).map((m) => String(m.id ?? ''));
    for (const want of prefs) {
      const hit = ids.find((id) => want.test(id));
      if (hit) {
        liveModel.set(provider.name, hit);
        console.warn(`[llm] ${provider.name}: ${provider.model} is gone, using ${hit}`);
        return hit;
      }
    }
  } catch {
    // no list: leave the provider to fail over as before
  }
  return null;
}

async function callOpenAICompat(opts: ChatOptions, provider: ResolvedKey['provider'], apiKey: string): Promise<string> {
  const body: Record<string, unknown> = {
    model: modelFor(provider),
    messages: [
      { role: 'system', content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.6,
    stream: false,
  };
  if (opts.json) body.response_format = { type: 'json_object' };

  const post = (payload: Record<string, unknown>) =>
    fetch(provider.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'ascend-jarvis/4.0 (+https://ascend-delta-sage.vercel.app)',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(provider.timeoutMs),
    });

  let res = await post(body);
  // The model was retired: switch to one this provider still serves, once.
  if (res.status === 404 || res.status === 410) {
    const detail = await res.clone().text().catch(() => '');
    if (/model/i.test(detail)) {
      const next = await pickLiveModel(provider, apiKey);
      if (next && next !== body.model) {
        body.model = next;
        res = await post(body);
      }
    }
  }
  // Some models reject response_format; the prompt + extractJson are the real
  // JSON guarantee, so retry once without it rather than failing the turn.
  if (res.status === 400 && opts.json) {
    const { response_format: _drop, ...withoutFormat } = body;
    res = await post(withoutFormat);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`${provider.name} ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  const message = data.choices?.[0]?.message;
  // Reasoning-style models (gpt-oss and similar) can put the actual answer in
  // reasoning_content and leave content empty, depending on the serving
  // backend and how much of the token budget the hidden reasoning consumed
  // before ever reaching a final answer. Observed on NIM's openai/gpt-oss-20b.
  const text = message?.content?.trim() || message?.reasoning_content?.trim() || '';
  if (!text) throw new Error(`${provider.name} returned empty content`);
  return text;
}

async function callGemini(opts: ChatOptions, model: string, apiKey: string): Promise<string> {
  const ai = await getGeminiClient(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: opts.messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
    config: {
      systemInstruction: opts.system,
      maxOutputTokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    },
  });
  return response.text ?? '';
}

/**
 * Fires one minimal real completion against a single specific key — used by
 * the Settings UI's "Test" action so a bad key is caught the moment it's
 * added, not discovered later as a silent failure buried in server logs only
 * the deploy owner can see. Reuses the exact same call path generateChat
 * uses, so "test passed" means the pool will genuinely be able to use it,
 * not just that the key superficially looks well-formed.
 */
export async function testKey(input: {
  provider: 'groq' | 'nvidia' | 'gemini' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ ok: boolean; error?: string; latencyMs: number }> {
  const started = Date.now();
  const opts: ChatOptions = {
    system: 'Reply with exactly one word: OK',
    messages: [{ role: 'user', content: 'ping' }],
    // Reasoning models (gpt-oss and similar) spend tokens on hidden
    // chain-of-thought before ever reaching the actual answer — 16 wasn't
    // enough room for that to complete even in the best case, regardless of
    // which field the answer landed in. 200 gives real reasoning room while
    // still keeping the test fast.
    maxTokens: 200,
  };
  try {
    if (input.provider === 'gemini') {
      await callGemini(opts, GEMINI_CHAIN[0], input.apiKey);
    } else if (input.provider === 'custom') {
      if (!input.baseUrl || !input.model) throw new Error('custom provider needs a base URL and model');
      await callOpenAICompat(opts, { name: 'custom', url: input.baseUrl, model: input.model, timeoutMs: 15_000 }, input.apiKey);
    } else {
      const shape = PROVIDER_SHAPE[input.provider];
      await callOpenAICompat(opts, shape, input.apiKey);
    }
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 300), latencyMs: Date.now() - started };
  }
}

/** One chat completion through the resilient provider chain. Returns raw model
 * text; callers extractJson/parse as needed. Throws GeminiError(429) with a
 * human-readable message only when every provider is exhausted. */
export async function generateChat(opts: ChatOptions): Promise<string> {
  // Order: named free-tier providers, then any custom endpoints the user
  // added, then Gemini last (smallest free daily cap — see the module doc).
  // Within one provider, each pooled key is tried in turn; a quota/rate-limit
  // shaped failure puts that specific key on a 15-minute cooldown and moves
  // to the next one, so one exhausted key degrades the pool by one rather
  // than taking the whole provider down.
  const attempt = async (provider: ResolvedKey['provider'], keyId: string | undefined, apiKey: string): Promise<string | null> => {
    const id = stallId(provider.name, keyId, apiKey);
    if (isStalled(id)) return null;
    const started = Date.now();
    try {
      const text = await callOpenAICompat(opts, provider, apiKey);
      opts.trace?.push({ provider: provider.name + ':' + modelFor(provider), ms: Date.now() - started, ok: true });
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      opts.trace?.push({ provider: provider.name, ms: Date.now() - started, ok: false, error: msg.slice(0, 160) });
      console.warn(`[llm] ${provider.name} (${keyId ?? 'env'}) failed, trying next:`, msg);
      if (isTimeout(err) || isQuotaError(err)) stalledUntil.set(id, Date.now() + STALLED_MS);
      if (keyId && isQuotaError(err)) void coolDownKey(keyId, msg, 15);
      return null;
    }
  };

  for (const name of ['groq', 'nvidia'] as const) {
    for (const { keyId, apiKey, provider } of await resolveKeys(name)) {
      const text = await attempt(provider, keyId, apiKey);
      if (text !== null) return text;
    }
  }

  for (const { keyId, apiKey, provider } of await resolveCustomKeys()) {
    const text = await attempt(provider, keyId, apiKey);
    if (text !== null) return text;
  }

  // Gemini: every pooled key (or the env fallback) crossed against every
  // model in GEMINI_CHAIN — a key that's fine but whose current model is
  // overloaded still gets to try that key's other models before moving on.
  const geminiPool = await activeKeysFor('gemini');
  const geminiKeys = geminiPool.length ? geminiPool.map((k) => ({ keyId: k.id as string | undefined, apiKey: k.key })) : [{ keyId: undefined, apiKey: process.env.GEMINI_API_KEY }];

  let lastErr: unknown;
  for (const { keyId, apiKey } of geminiKeys) {
    if (!apiKey) continue;
    for (const model of GEMINI_CHAIN) {
      const started = Date.now();
      try {
        const text = await callGemini(opts, model, apiKey);
        opts.trace?.push({ provider: 'gemini:' + model, ms: Date.now() - started, ok: true });
        return text;
      } catch (err) {
        lastErr = err;
        opts.trace?.push({ provider: 'gemini:' + model, ms: Date.now() - started, ok: false, error: String((err as Error)?.message ?? err).slice(0, 160) });
        if (!isQuotaError(err) && !isOverloadError(err)) throw err;
        console.warn(`[llm] gemini ${model} (${keyId ?? 'env'}) unavailable, trying next:`, (err as Error).message.slice(0, 120));
        if (keyId && isQuotaError(err)) { void coolDownKey(keyId, (err as Error).message, 60); break; }
      }
    }
  }

  throw new GeminiError(
    429,
    isOverloadError(lastErr)
      ? "Every model I can reach is overloaded right now, sir — that usually clears within a minute. Try again shortly."
      : "I've hit the limits on every AI provider for now, sir — quotas reset within minutes to hours. Give it a short while and try again.",
  );
}

/** One structured-output call through the chain: returns JSON parsed to T. */
export async function generateStructured<T>(opts: {
  system: string;
  prompt: string;
  schema: object;
  maxTokens?: number;
}): Promise<T> {
  const system = `${opts.system}

Respond with a single JSON object and nothing else — no prose, no markdown fences. It must conform exactly to this JSON Schema (every required field, correct types):

${JSON.stringify(opts.schema, null, 2)}`;

  const text = await generateChat({
    system,
    messages: [{ role: 'user', content: opts.prompt }],
    json: true,
    maxTokens: opts.maxTokens ?? 8192,
  });
  if (!text) throw new GeminiError(502, 'The model returned no output. Please try again.');
  try {
    return JSON.parse(extractJson(text)) as T;
  } catch {
    throw new GeminiError(502, 'The model did not return valid JSON. Please try again.');
  }
}
