/**
 * Timetable photo -> structured lessons, via Gemini vision.
 *
 * Same shape as transcribe-routes.ts: stateless, base64 payload in, JSON out.
 * The server never writes Firestore here — the client shows the parsed rows
 * for a quick review/edit before saving, because a misread cell (a "9" read
 * as an "8") is a two-second fix by hand, and silently saving whatever the
 * model guessed is a wrong 5-minutes-before ping every week until noticed.
 */
import express, { Router, type Request, type Response } from 'express';
import { getGemini, GEMINI_CHAIN, GeminiError, extractJson, isOverloadError, isQuotaError } from './gemini';
import { logEvent } from './server-log';

export const timetableRouter = Router();

// A phone photo of a timetable easily exceeds the app-wide 256kb JSON limit.
timetableRouter.use(express.json({ limit: '4mb' }));

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PROMPT = `This image is a photo of a weekly class/lecture timetable — a grid of
days vs. times. Read every lesson slot you can make out and return ONLY a JSON
object of this exact shape, no prose, no markdown fence:

{"lessons":[{"day":1,"start":"09:00","end":"10:00","subject":"QTM","room":"LT-2"}]}

Rules:
- "day": 0=Sunday, 1=Monday, ... 6=Saturday (match the grid's actual day columns/rows).
- "start"/"end": 24-hour "HH:MM". If only a start time is legible, set "end" to one hour after "start".
- "subject": the short name/code as written (e.g. "QTM", "Accounts", "FAR") — don't expand abbreviations you're not sure of.
- "room": omit the field entirely if it isn't legible or isn't shown.
- Skip a cell entirely rather than guessing if it's genuinely unreadable — a missing lesson is better than a wrong one.
- If the image isn't a timetable at all, return {"lessons":[]}.`;

async function parseWithGemini(imageB64: string, mime: string): Promise<unknown> {
  const ai = await getGemini();
  let lastErr: unknown;
  for (const model of GEMINI_CHAIN) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: mime, data: imageB64 } }, { text: PROMPT }],
          },
        ],
        config: { maxOutputTokens: 4096 },
      });
      return JSON.parse(extractJson(response.text ?? '{}'));
    } catch (err) {
      lastErr = err;
      // Only worth trying the next model in the chain for exactly the
      // failures that chain exists for; anything else (bad prompt, malformed
      // JSON) will fail identically on every model, so don't burn the quota.
      if (!isQuotaError(err) && !isOverloadError(err)) throw err;
    }
  }
  throw lastErr;
}

timetableRouter.post('/parse', async (req: Request, res: Response) => {
  try {
    const { image, mimeType } = req.body ?? {};
    if (typeof image !== 'string' || image.length === 0) {
      res.status(400).json({ error: '`image` must be a non-empty base64 string.' });
      return;
    }
    const mime = typeof mimeType === 'string' ? mimeType.split(';')[0] : '';
    if (!ALLOWED_MIME.has(mime)) {
      res.status(400).json({ error: `Unsupported mimeType "${mime}". Use a JPEG, PNG or WebP.` });
      return;
    }

    const parsed = await parseWithGemini(image, mime);
    const lessons = Array.isArray((parsed as { lessons?: unknown })?.lessons)
      ? (parsed as { lessons: unknown[] }).lessons
      : [];
    res.json({ lessons });
  } catch (err: unknown) {
    if (isQuotaError(err)) {
      res.status(429).json({ error: 'Timetable reading has hit its limits for now — try again shortly.' });
      return;
    }
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Could not read that timetable.';
    if (status >= 500) console.error('[timetable]', err);
    logEvent({ level: status >= 500 ? 'error' : 'warn', scope: 'timetable', message, meta: { status } });
    res.status(status).json({ error: "Couldn't read that image as a timetable — try a clearer or straighter photo." });
  }
});
