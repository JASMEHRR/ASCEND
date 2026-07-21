/**
 * Speech-to-text relay for Jarvis dictation (desktop "Whisper Flow" feature).
 *
 * Accepts a short base64 audio clip, transcribes it via the shared Gemini
 * client, and returns plain text. Stateless, same key/deploy shape as the
 * other routes. Payload is capped at ~6 MB (raised per-router below) which
 * comfortably fits several minutes of webm/opus dictation while staying under
 * Vercel's request-body ceiling.
 */
import express, { Router, type Request, type Response } from 'express';
import { getGemini, GEMINI_MODEL, GeminiError } from './gemini';

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

    const ai = await getGemini();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mime, data: audio } },
            {
              text:
                'Transcribe this audio verbatim. Output ONLY the spoken words as plain text — no labels, no quotes, no commentary. Preserve the language spoken (English/Hindi/Hinglish as heard). If the audio contains no speech, output an empty string.',
            },
          ],
        },
      ],
      config: { maxOutputTokens: 2048 },
    });

    res.json({ text: (response.text ?? '').trim() });
  } catch (err: unknown) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Transcription failed';
    if (status >= 500) console.error('[transcribe]', err);
    res.status(status).json({ error: message });
  }
});
