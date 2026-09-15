/**
 * Server-side Google OAuth (authorization-code flow, offline access) — the
 * only way telegram-cron.ts can read Calendar with no browser tab open.
 *
 * Distinct from GoogleContext's client-side flow: that one (Google Identity
 * Services token client) hands the browser a short-lived access token that
 * lives in memory and is gone the moment the tab closes — fine for Jarvis
 * answering "what's on my calendar", useless for a server cron running hours
 * later. This flow instead gets a refresh_token once, during a one-time
 * "Connect Calendar for Telegram alerts" click, and stores it server-side so
 * the cron can mint fresh access tokens indefinitely without you around.
 *
 * Setup (project owner, one-time — see GOOGLE_SETUP.md for the full steps):
 *   1. Same OAuth client as the existing Calendar/Gmail setup, but it also
 *      needs a Client Secret and an Authorized redirect URI added:
 *      <your-domain>/api/google-oauth/callback
 *   2. Env vars: GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI
 *      (GOOGLE_CLIENT_ID reuses VITE_GOOGLE_CLIENT_ID if a bare
 *      GOOGLE_CLIENT_ID isn't set separately — client IDs aren't secret).
 *   3. Visit /api/google-oauth/start once, signed in as yourself, and
 *      approve the consent screen.
 *
 * Single-user by design, matching the rest of this app's Telegram surface:
 * the token is always stored under ASCEND_UID, never a per-request id.
 */
import { Router, type Request, type Response } from 'express';
import { getAdminDb } from './admin-db';
import { logEvent } from './server-log';

export const googleOAuthRouter = Router();

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function clientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
}

googleOAuthRouter.get('/start', (req: Request, res: Response) => {
  const id = clientId();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !redirectUri || !secret) {
    res
      .status(500)
      .send('Google OAuth is not fully configured. Set GOOGLE_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI — see GOOGLE_SETUP.md.');
    return;
  }
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // Forces the consent screen every time, which is the only way Google
    // reliably hands back a refresh_token — without it, a second connect
    // attempt (e.g. after revoking access) silently returns none.
    prompt: 'consent',
  });
  res.redirect(`${AUTH_URL}?${params}`);
});

googleOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const error = typeof req.query.error === 'string' ? req.query.error : null;
  if (error) {
    res.status(400).send(`Google declined: ${error}`);
    return;
  }
  if (!code) {
    res.status(400).send('Missing authorization code.');
    return;
  }

  const id = clientId();
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const uid = process.env.ASCEND_UID;
  if (!id || !secret || !redirectUri || !uid) {
    res.status(500).send('Google OAuth is not fully configured server-side.');
    return;
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
    if (!tokenRes.ok || !data.refresh_token) {
      // The common failure: re-approving without `prompt=consent` having
      // taken effect, or an account that already granted this app access
      // once before and Google is reusing the old (revoked) grant silently.
      res
        .status(400)
        .send(
          `Google didn't return a refresh token (${data.error ?? tokenRes.status}: ${data.error_description ?? 'unknown'}). ` +
            'If you\'ve connected this app before, revoke access at myaccount.google.com/permissions first, then try again.',
        );
      return;
    }

    const db = await getAdminDb();
    if (!db) {
      res.status(500).send('Firestore admin access is not configured (FIREBASE_SERVICE_ACCOUNT).');
      return;
    }
    await db.doc(`users/${uid}/googleTokens/main`).set({
      refreshToken: data.refresh_token,
      connectedAt: new Date().toISOString(),
    });

    logEvent({ level: 'info', scope: 'google-oauth', message: 'calendar connected for telegram alerts' });
    res.send(
      '<html><body style="font-family:sans-serif;padding:2rem"><h2>Calendar connected.</h2>' +
        '<p>Telegram will now text you before upcoming events. You can close this tab.</p></body></html>',
    );
  } catch (err) {
    logEvent({ level: 'error', scope: 'google-oauth', message: (err as Error).message });
    res.status(500).send('Token exchange failed — check the server logs.');
  }
});

// ── used by telegram-cron.ts ────────────────────────────────────────────

interface AdminFirestoreLike {
  doc: (path: string) => {
    get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  };
}

interface CalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const id = clientId();
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/**
 * Upcoming events for Jarvis to answer "what's on my calendar" from on
 * Telegram — a wider window than collectCalendarAlerts' 10-minute alert
 * lookahead below, since this is read on-demand in conversation rather than
 * polled for imminent-start pings. Same token path (stored refresh_token,
 * see the OAuth flow above); returns null (not []) when Calendar was never
 * connected, so the persona prompt can say so instead of implying an empty day.
 */
export async function fetchUpcomingEvents(
  uid: string,
  db: AdminFirestoreLike,
  hoursAhead = 24,
): Promise<{ summary: string; start: string }[] | null> {
  const snap = await db.doc(`users/${uid}/googleTokens/main`).get();
  if (!snap.exists) return null;
  const stored = snap.data() as { refreshToken?: string };
  if (!stored.refreshToken) return null;

  const accessToken = await refreshAccessToken(stored.refreshToken);
  if (!accessToken) return null;

  const now = Date.now();
  const params = new URLSearchParams({
    timeMin: new Date(now).toISOString(),
    timeMax: new Date(now + hoursAhead * 60 * 60_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '15',
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: CalEvent[] };
  return (data.items ?? [])
    .filter((e) => e.start?.dateTime || e.start?.date)
    .map((e) => ({
      summary: e.summary ?? '(untitled event)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
    }));
}

/**
 * Text for each event starting in the next few minutes — pushed into the
 * caller's own `messages`/`newlySeen` arrays rather than sending directly, so
 * calendar alerts go through the exact same collect-then-send-then-persist
 * path as every other source in telegram-cron.ts (one accurate `sent` count,
 * one place that decides what "already notified" means).
 */
export async function collectCalendarAlerts(
  db: AdminFirestoreLike,
  uid: string,
  seen: Set<string>,
  messages: string[],
  newlySeen: string[],
): Promise<string> {
  const snap = await db.doc(`users/${uid}/googleTokens/main`).get();
  if (!snap.exists) return 'calendar not connected';
  const stored = snap.data() as { refreshToken?: string };
  if (!stored.refreshToken) return 'calendar not connected';

  const accessToken = await refreshAccessToken(stored.refreshToken);
  if (!accessToken) return 'calendar token refresh failed';

  const now = Date.now();
  const params = new URLSearchParams({
    timeMin: new Date(now).toISOString(),
    // 10 min out: wide enough to catch an event even if the cron's own
    // interval is coarser than 5 minutes, narrow enough that nothing fires
    // twice as "coming up" across two consecutive passes.
    timeMax: new Date(now + 10 * 60_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '10',
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return `calendar fetch failed (${res.status})`;
  const data = (await res.json()) as { items?: CalEvent[] };

  let queued = 0;
  for (const e of data.items ?? []) {
    const startIso = e.start?.dateTime;
    if (!startIso || !e.id) continue; // all-day events have no specific "5 min before"
    const minsUntil = Math.round((Date.parse(startIso) - now) / 60_000);
    if (minsUntil < 0 || minsUntil > 6) continue;
    const key = `calendar:${e.id}:${startIso}`;
    if (seen.has(key)) continue;
    messages.push(`📅 **${e.summary ?? '(untitled event)'}** starts ${minsUntil <= 0 ? 'now' : `in ${minsUntil} min`}.`);
    newlySeen.push(key);
    queued += 1;
  }
  return `calendar (${queued} queued)`;
}
