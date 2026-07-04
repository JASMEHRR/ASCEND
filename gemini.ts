/**
 * Shared server-side Gemini helpers. Every AI feature (Physio chat, LaunchKit
 * generators, Jarvis) goes through here so there's one client, one model
 * constant, and one JSON extractor — no duplicated AI infrastructure.
 *
 * The GEMINI_API_KEY is read server-side only and never reaches the client.
 */
import type { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL = 'gemini-2.5-flash';
/** Fallback when the primary model's (tiny) free-tier daily quota is exhausted. */
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/** Does this upstream error mean "quota/rate exhausted for this model"? */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|"code"\s*:\s*429|exceeded your current quota|rate.?limit/i.test(msg);
}

/** Error carrying an HTTP status for the route error handlers. */
export class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let clientPromise: Promise<GoogleGenAI> | null = null;

/** Lazily construct (and memoize) the Gemini client. */
export async function getGemini(): Promise<GoogleGenAI> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError(500, 'Missing GEMINI_API_KEY environment variable.');
  if (!clientPromise) {
    clientPromise = import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
  }
  return clientPromise;
}

/**
 * Pull a JSON object out of a model response, tolerating ```json fences, a
 * leading <think>…</think> block, or prose around the object.
 */
export function extractJson(raw: string): string {
  let text = raw.trim();
  const thinkEnd = text.lastIndexOf('</think>');
  if (thinkEnd !== -1) text = text.slice(thinkEnd + '</think>'.length).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (text.startsWith('{') && text.endsWith('}')) return text;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text;
}

/** One structured-output call to Gemini: returns JSON parsed to T. */
export async function generateStructured<T>(opts: {
  system: string;
  prompt: string;
  schema: object;
  maxTokens?: number;
}): Promise<T> {
  const ai = await getGemini();
  const system = `${opts.system}

Respond with a single JSON object and nothing else — no prose, no markdown fences. It must conform exactly to this JSON Schema (every required field, correct types):

${JSON.stringify(opts.schema, null, 2)}`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: opts.prompt,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens: opts.maxTokens ?? 8192,
    },
  });

  const text = response.text ?? '';
  if (!text) throw new GeminiError(502, 'The model returned no output. Please try again.');
  try {
    return JSON.parse(extractJson(text)) as T;
  } catch {
    throw new GeminiError(502, 'The model did not return valid JSON. Please try again.');
  }
}
