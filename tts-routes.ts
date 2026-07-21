/**
 * Jarvis voice — ElevenLabs TTS proxy.
 *
 * The ELEVENLABS_API_KEY stays server-side; the client posts text + a voice id
 * and gets mp3 bytes back. Uses eleven_flash_v2_5 (lowest latency, 0.5
 * credits/char — doubles the effective free-tier quota) and clamps input so a
 * long reply can't burn the monthly budget; the client speaks the short
 * "speak" line anyway. Quota/auth failures return code:"quota" so the client
 * can latch onto browser SpeechSynthesis for the rest of the session.
 */
import { Router, type Request, type Response } from 'express';

export const ttsRouter = Router();

const ELEVEN_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const MAX_CHARS = 500;

ttsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      res.status(503).json({ error: 'ElevenLabs is not configured.', code: 'not_configured' });
      return;
    }

    const text = String(req.body?.text ?? '').trim().slice(0, MAX_CHARS);
    const voiceId = String(req.body?.voiceId ?? '').trim();
    if (!text || !/^[A-Za-z0-9]{10,40}$/.test(voiceId)) {
      res.status(400).json({ error: '`text` and a valid `voiceId` are required.' });
      return;
    }

    const upstream = await fetch(`${ELEVEN_URL}/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 300);
      const quota =
        upstream.status === 401 || upstream.status === 429 || /quota_exceeded|character_limit/i.test(detail);
      if (!quota) console.error('[tts] upstream', upstream.status, detail);
      res
        .status(quota ? 429 : 502)
        .json({ error: quota ? 'ElevenLabs quota reached.' : 'TTS failed upstream.', code: quota ? 'quota' : 'upstream' });
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (err) {
    console.error('[tts]', err);
    res.status(502).json({ error: 'TTS request failed.', code: 'upstream' });
  }
});
