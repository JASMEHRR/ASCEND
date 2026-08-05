/**
 * Zerodha Kite Connect — READ-ONLY portfolio access.
 *
 * The API secret never leaves this server: the browser is redirected to
 * Zerodha's login, Zerodha redirects back to /api/kite/callback with a
 * request_token, and the checksum'd token exchange happens here. The resulting
 * access_token is handed to the SPA via a URL *fragment* (never sent to any
 * server or logged) which the client consumes, strips, and stores per-user —
 * the backend stays stateless, matching the app's other credentials.
 *
 * Registered redirect URL (kite.trade app console):
 *   https://ascend-delta-sage.vercel.app/api/kite/callback
 *
 * Data routes are proxies because api.kite.trade has no browser CORS. There
 * are deliberately NO order placement/modification routes — read-only by
 * construction. Kite access tokens expire daily (~7:30am IST); expiry is
 * surfaced as 401 + code "kite_token_expired" so the client can prompt a
 * reconnect instead of silently breaking each morning.
 */
import { Router, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { logEvent } from './server-log';

export const kiteRouter = Router();

const KITE_BASE = 'https://api.kite.trade';

// GET /api/kite/login — start the flow with the api_key kept server-side.
kiteRouter.get('/login', (_req: Request, res: Response) => {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    res.redirect('/#kite_error=not_configured');
    return;
  }
  res.redirect(`https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`);
});

// GET /api/kite/callback?request_token=...&status=success — Zerodha lands here.
kiteRouter.get('/callback', async (req: Request, res: Response) => {
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  const requestToken = String(req.query.request_token ?? '').trim();

  if (!apiKey || !apiSecret) {
    res.redirect('/#kite_error=not_configured');
    return;
  }
  if (req.query.status !== 'success' || !requestToken) {
    res.redirect('/#kite_error=denied');
    return;
  }

  try {
    const checksum = createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex');
    const upstream = await fetch(`${KITE_BASE}/session/token`, {
      method: 'POST',
      headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await upstream.json().catch(() => null)) as {
      data?: { access_token?: string };
      message?: string;
    } | null;
    const accessToken = data?.data?.access_token;
    if (!upstream.ok || !accessToken) {
      console.error('[kite] token exchange failed', upstream.status, data?.message ?? '');
      logEvent({ level: 'error', scope: 'kite', message: 'token exchange failed', meta: { status: upstream.status } });
      res.redirect('/#kite_error=exchange_failed');
      return;
    }
    res.redirect(`/#kite_token=${encodeURIComponent(accessToken)}`);
  } catch (err) {
    console.error('[kite] callback', err);
    logEvent({ level: 'error', scope: 'kite', message: (err as Error).message ?? 'callback failed' });
    res.redirect('/#kite_error=exchange_failed');
  }
});

// Read-only data proxies. The client passes its access token per request in
// the x-kite-token header — no token is ever stored server-side.
const DATA_PATHS = {
  holdings: '/portfolio/holdings',
  positions: '/portfolio/positions',
  margins: '/user/margins',
} as const;

for (const [name, path] of Object.entries(DATA_PATHS)) {
  kiteRouter.get(`/${name}`, async (req: Request, res: Response) => {
    const apiKey = process.env.KITE_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Kite Connect is not configured.', code: 'not_configured' });
      return;
    }
    const token = String(req.header('x-kite-token') ?? '').trim();
    if (!token) {
      res.status(400).json({ error: 'Missing x-kite-token header.' });
      return;
    }

    try {
      const upstream = await fetch(`${KITE_BASE}${path}`, {
        headers: { 'X-Kite-Version': '3', Authorization: `token ${apiKey}:${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await upstream.json().catch(() => null)) as {
        status?: string;
        data?: unknown;
        error_type?: string;
        message?: string;
      } | null;

      if (upstream.status === 403 || data?.error_type === 'TokenException') {
        res.status(401).json({
          error: 'Kite session expired — access tokens reset daily around 7:30am IST. Reconnect from Settings.',
          code: 'kite_token_expired',
        });
        return;
      }
      if (!upstream.ok || data?.status !== 'success') {
        console.error('[kite]', name, upstream.status, data?.message ?? '');
        logEvent({ level: 'error', scope: 'kite', message: `${name} upstream failed`, meta: { status: upstream.status } });
        res.status(502).json({ error: data?.message ?? 'Kite request failed.', code: 'upstream' });
        return;
      }
      res.json(data.data);
    } catch (err) {
      console.error('[kite]', name, err);
      logEvent({ level: 'error', scope: 'kite', message: (err as Error).message ?? `${name} failed` });
      res.status(502).json({ error: 'Kite request failed.', code: 'upstream' });
    }
  });
}
