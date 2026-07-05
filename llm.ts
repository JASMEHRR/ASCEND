/**
 * Provider-agnostic LLM front door. Every AI feature (Jarvis, Physio chat,
 * LaunchKit generators) calls generateChat/generateStructured here instead of
 * talking to a provider directly, so the whole app shares one resilient chain:
 *
 *   Groq (Llama 4 Maverick, free ~30 req/min — reachable from Vercel)
 *     → NVIDIA NIM (same model; NVIDIA's edge silently drops chat POSTs from
 *       Vercel egress, but NIM works from local dev and may recover)
 *       → Gemini 2.5 Flash (free ~20 req/day)
 *         → Gemini 2.5 Flash-Lite
 *           → clear 429 error (never a silent failure)
 *
 * Per-minute free tiers lead the chain because the v3 root cause of "Jarvis
 * randomly broken" was Gemini's tiny daily cap. All keys (GROQ_API_KEY,
 * NVIDIA_API_KEY, GEMINI_API_KEY) are server-side only; a missing key just
 * skips that hop.
 */
import { getGemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL, isQuotaError, GeminiError, extractJson } from './gemini';

export { GeminiError, extractJson };

/** Llama 4 Maverick: MoE (~17B active) so flash-class latency, reliable at
 * strict-JSON instruction following, 1M context. See BUILD_NOTES.md (v4). */
export const NIM_MODEL = 'meta/llama-4-maverick-17b-128e-instruct';

/** OpenAI-compatible hops, tried in order (missing key = skipped). */
const OPENAI_PROVIDERS = [
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    timeoutMs: 30_000,
  },
  {
    name: 'nim',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    keyEnv: 'NVIDIA_API_KEY',
    model: NIM_MODEL,
    // A healthy NIM answers in 1-5s; when its edge drops the request
    // (observed from Vercel: /v1/models 200 in 13ms, chat POST never
    // returns, streamed or not) fail over fast instead of stalling.
    timeoutMs: 15_000,
  },
] as const;

type OpenAIProvider = (typeof OPENAI_PROVIDERS)[number];

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

async function callOpenAICompat(opts: ChatOptions, provider: OpenAIProvider, apiKey: string): Promise<string> {
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

async function callGemini(opts: ChatOptions, model: string): Promise<string> {
  const ai = await getGemini();
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

/** One chat completion through the resilient provider chain. Returns raw model
 * text; callers extractJson/parse as needed. Throws GeminiError(429) with a
 * human-readable message only when every provider is exhausted. */
export async function generateChat(opts: ChatOptions): Promise<string> {
  for (const provider of OPENAI_PROVIDERS) {
    const apiKey = process.env[provider.keyEnv];
    if (!apiKey) continue;
    try {
      return await callOpenAICompat(opts, provider, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llm] ${provider.name} failed, trying next provider:`, msg);
    }
  }

  try {
    return await callGemini(opts, GEMINI_MODEL);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    try {
      return await callGemini(opts, GEMINI_FALLBACK_MODEL);
    } catch (err2) {
      if (isQuotaError(err2)) {
        throw new GeminiError(
          429,
          "I've hit the limits on every AI provider for now, sir — quotas reset within minutes to hours. Give it a short while and try again.",
        );
      }
      throw err2;
    }
  }
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
