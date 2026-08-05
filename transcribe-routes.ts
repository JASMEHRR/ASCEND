/**
 * Speech-to-text relay for Jarvis dictation (desktop "Whisper Flow" feature).
 *
 * Provider chain, same philosophy as llm.ts's chat chain:
 *   Groq (whisper-large-v3-turbo, generous free tier, fast)
 *     → Gemini 2.5 Flash (free ~20 requests/DAY — this alone was exhausting
 *       within a normal session, which is why Groq leads)
 *       → clear error (never a silent failure)
 *
 * Accepts a short base64 audio clip, returns plain text. Stateless, same
 * key/deploy shape as the other routes. Payload is capped at ~6 MB (raised
 * per-router below) which comfortably fits several minutes of webm/opus
 * dictation while staying under Vercel's request-body ceiling.
 */
import express, { Router, type Request, type Response } from 'express';
import { getGemini, GEMINI_MODEL, GeminiError, isQuotaError } from './gemini';
import { logEvent } from './server-log';

export const transcribeRouter = Router();

// Audio payloads are far larger than the app-wide 256 kb JSON limit.
transcribeRouter.use(express.json({ limit: '6mb' }));

const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
]);

const GROQ_TIMEOUT_MS = 20_000;

/** Groq's Whisper endpoint (OpenAI-compatible, multipart upload). */
async function transcribeWithGroq(audioBuf: Buffer, mime: string, apiKey: string): Promise<string> {
  const ext = mime.split('/')[1] || 'webm';
  const form = new FormData();
  form.append('file', new Blob([audioBuf], { type: mime }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`groq ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

/** Gemini fallback: same inline-audio approach as before. */
async function transcribeWithGemini(audioB64: string, mime: string): Promise<string> {
  const ai = await getGemini();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mime, data: audioB64 } },
          {
            text:
              'Transcribe this audio verbatim. Output ONLY the spoken words as plain text — no labels, no quotes, no commentary. Preserve the language spoken (English/Hindi/Hinglish as heard). If the audio contains no speech, output an empty string.',
          },
        ],
      },
    ],
    config: { maxOutputTokens: 2048 },
  });
  return (response.text ?? '').trim();
}

transcribeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { audio, mimeType } = req.body ?? {};
    if (typeof audio !== 'string' || audio.length === 0) {
      res.status(400).json({ error: '`audio` must be a non-empty base64 string.' });
      return;
    }
    const mime = typeof mimeType === 'string' ? mimeType.split(';')[0] : '';
    if (!ALLOWED_MIME.has(mime)) {
      res.status(400).json({ error: `Unsupported mimeType "${mime}".` });
      return;
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const buf = Buffer.from(audio, 'base64');
        const text = await transcribeWithGroq(buf, mime, groqKey);
        res.json({ text });
        return;
      } catch (err) {
        console.warn('[transcribe] groq failed, falling back to gemini:', (err as Error).message);
        logEvent({ level: 'warn', scope: 'transcribe', message: 'groq failed, falling back to gemini' });
      }
    }

    try {
      const text = await transcribeWithGemini(audio, mime);
      res.json({ text });
    } catch (err) {
      if (isQuotaError(err)) {
        res.status(429).json({
          error: "Speech-to-text has hit its limits on every provider for now, sir — try again shortly.",
        });
        return;
      }
      throw err;
    }
  } catch (err: unknown) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Transcription failed';
    if (status >= 500) console.error('[transcribe]', err);
    logEvent({ level: status >= 500 ? 'error' : 'warn', scope: 'transcribe', message, meta: { status } });
    res.status(status).json({ error: message });
  }
});
