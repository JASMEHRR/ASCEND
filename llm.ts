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
    timeoutMs: 30_000,
  },
  nvidia: {
    name: 'nim',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    model: NIM_MODEL,
    // A healthy NIM answers in 1-5s; when its edge drops the request
    // (observed from Vercel: /v1/models 200 in 13ms, chat POST never
    // returns, streamed or not) fail over fast instead of stalling.
    timeoutMs: 15_000,
  },
} as const;

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
}

async function callOpenAICompat(opts: ChatOptions, provider: ResolvedKey['provider'], apiKey: string): Promise<string> {
  const body: Record<string, unknown> = {
    model: provider.model,
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
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error(`${provider.name} returned empty content`);
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
    maxTokens: 16,
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
  for (const name of ['groq', 'nvidia'] as const) {
    const keys = await resolveKeys(name);
    for (const { keyId, apiKey, provider } of keys) {
      try {
        return await callOpenAICompat(opts, provider, apiKey);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[llm] ${provider.name} (${keyId ?? 'env'}) failed, trying next:`, msg);
        if (keyId && isQuotaError(err)) void coolDownKey(keyId, msg, 15);
      }
    }
  }

  for (const { keyId, apiKey, provider } of await resolveCustomKeys()) {
    try {
      return await callOpenAICompat(opts, provider, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llm] ${provider.name} failed, trying next:`, msg);
      if (keyId && isQuotaError(err)) void coolDownKey(keyId, msg, 15);
    }
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
      try {
        return await callGemini(opts, model, apiKey);
      } catch (err) {
        lastErr = err;
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
