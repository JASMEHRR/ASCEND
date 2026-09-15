/**
 * Test-a-key endpoint for the Settings UI (LlmKeysSettings.tsx). Fires one
 * minimal real completion using the exact key/provider the user just typed
 * in, before it's trusted to sit in the pool — a bad key otherwise only
 * surfaces later as a silent failure in server logs nobody but the deploy
 * owner can see.
 *
 * Public on purpose, same reasoning as /api/stocks: it touches no stored
 * secret, only the key supplied in the request body, which the caller
 * already holds (they just typed it into their own browser). Worst case of
 * abuse is someone burning a request against their own key's own quota.
 */
import { Router, type Request, type Response } from 'express';
import { testKey } from './llm';

export const llmKeysRouter = Router();

llmKeysRouter.post('/test', async (req: Request, res: Response) => {
  const { provider, key, baseUrl, model } = req.body ?? {};
  const validProvider = provider === 'groq' || provider === 'nvidia' || provider === 'gemini' || provider === 'custom';
  if (!validProvider || typeof key !== 'string' || !key.trim()) {
    res.status(400).json({ ok: false, error: 'provider and key are required.' });
    return;
  }
  if (provider === 'custom' && (typeof baseUrl !== 'string' || !baseUrl.trim() || typeof model !== 'string' || !model.trim())) {
    res.status(400).json({ ok: false, error: 'custom provider needs a base URL and model.' });
    return;
  }

  const result = await testKey({
    provider,
    apiKey: key.trim(),
    baseUrl: typeof baseUrl === 'string' ? baseUrl.trim() : undefined,
    model: typeof model === 'string' ? model.trim() : undefined,
  });
  res.json(result);
});
