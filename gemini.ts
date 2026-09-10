/**
 * Low-level Gemini layer: client, model constants, quota detection, and the
 * shared JSON extractor. Since v4, features don't call this directly — they go
 * through the provider chain in `llm.ts` (NIM primary, Gemini fallback).
 *
 * The GEMINI_API_KEY is read server-side only and never reaches the client.
 */
import type { GoogleGenAI } from '@google/genai';

// Both 2.5 models now 404 with "no longer available to new users", which had
// quietly killed the whole Gemini tier: once Groq and NIM were exhausted there
// was nothing left to fall back to. Verified against the live API — 3.6-flash
// answers, and there is no 3.6 lite tier to demote to.
export const GEMINI_MODEL = 'gemini-3.6-flash';
/**
 * Fallback when the primary model's (tiny) free-tier daily quota is exhausted.
 * The lite tier is gone, so this is the rolling alias rather than a cheaper
 * model: it mostly buys a retry that survives the next model rename.
 */
export const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

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
