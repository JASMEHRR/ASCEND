/**
 * Glass Home, the Fire TV launcher, talking to Jarvis.
 *
 * Same brain as the web app and Telegram (runJarvisTurn: one prompt, one model chain), with the
 * TV's own actions declared as tools. The TV runs whatever toolCalls come back (open an app,
 * search Stremio or YouTube, play/pause, ...), the same way Ascend's client runs its tools.
 *
 * The TV proves itself with a long random key. Only the key's SHA-256 lives here (or in the
 * TV_JARVIS_KEY_SHA256 env var, which wins), so neither the repo nor the deploy holds the key.
 * Rotate it by making a new key on the TV side and replacing the hash.
 */
import { Router, type Request, type Response } from 'express';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { getAdminDb } from './admin-db';
import { runJarvisTurn } from './jarvis-routes';
import { GeminiError, type LlmAttempt } from './llm';
import { logEvent } from './server-log';
import { synthesizeSpeech } from './tts-routes';

export const tvRouter = Router();

const KEY_SHA256 = (process.env.TV_JARVIS_KEY_SHA256 || 'b0c3a8d8b4800adb65b0f68de540b8f27f7d46cc2c3c96c30b295b53fd11bffd').trim().toLowerCase();

function keyOk(key: unknown): boolean {
  if (typeof key !== 'string' || key.length < 32 || key.length > 200) return false;
  const given = createHash('sha256').update(key).digest();
  const want = Buffer.from(KEY_SHA256, 'hex');
  return want.length === given.length && timingSafeEqual(given, want);
}

/** What Jarvis can do on the TV. Glass Home runs these; names and args must match its app.js. */
const TV_TOOLS = [
  { name: 'openApp', module: 'tv', description: 'Open an app on the TV', parameters: { app: 'an app name from context.apps' } },
  { name: 'searchStremio', module: 'tv', description: 'Open Stremio search for a film, show or anime (Stremio is where the user watches films, shows and anime)', parameters: { query: 'title or words to search' } },
  { name: 'searchYouTube', module: 'tv', description: 'Open YouTube search (in SmartTube)', parameters: { query: 'what to search' } },
  { name: 'media', module: 'tv', description: 'Control what is playing', parameters: { action: 'play | pause | next | previous' } },
  { name: 'showScreen', module: 'tv', description: 'Show a Glass Home screen', parameters: { screen: 'home | foryou | ambient | command | settings' } },
  { name: 'sleepTimer', module: 'tv', description: 'Turn the TV off after some minutes; 0 cancels', parameters: { minutes: 'number' } },
];

const TV_NOTE =
  'You are speaking through Glass Home, the launcher on the user\'s Fire TV. Your reply is shown on the TV and spoken aloud, ' +
  'so keep "reply" to one to three short sentences with no markdown, lists or tables. Use the tv tools to act on the TV; ' +
  'for "play/watch X" prefer searchStremio. context.apps lists the installed apps.';

interface TvMessage { role?: unknown; content?: unknown }

tvRouter.post('/jarvis', async (req: Request, res: Response) => {
  const { key, messages, context } = (req.body ?? {}) as { key?: unknown; messages?: unknown; context?: unknown };
  if (!keyOk(key)) {
    res.status(401).json({ error: 'TV key not accepted.' });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: '`messages` must be a non-empty array.' });
    return;
  }
  const history = (messages as TvMessage[]).slice(-12).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content ?? '').slice(0, 2000),
  }));
  const extra = context && typeof context === 'object' ? (context as Record<string, unknown>) : {};
  const ctx = { ...extra, user: 'JasMehr', surface: 'tv', now: new Date().toISOString(), tv: TV_NOTE };
  const trace: LlmAttempt[] = [];
  const started = Date.now();
  try {
    const out = await runJarvisTurn(history, ctx, TV_TOOLS, trace);
    // which providers were tried and how long each took (no keys): shows where a slow answer went
    res.json({ ...out, timing: { totalMs: Date.now() - started, attempts: trace } });
  } catch (err: unknown) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Jarvis request failed';
    logEvent({ level: status >= 500 ? 'error' : 'warn', scope: 'tv-jarvis', message, meta: { status } });
    res.status(status).json({ error: message });
  }
});

/** Jarvis's voice for the TV: the same ElevenLabs voice as Ascend (Daniel by default), as mp3. */
const TV_VOICE = process.env.TV_JARVIS_VOICE || 'onwK4e9ZLuTAKqWW03F9';

tvRouter.post('/speak', async (req: Request, res: Response) => {
  const { key, text } = (req.body ?? {}) as { key?: unknown; text?: unknown };
  if (!keyOk(key)) {
    res.status(401).json({ error: 'TV key not accepted.' });
    return;
  }
  const words = String(text ?? '').trim().slice(0, 400);
  const eleven = process.env.ELEVENLABS_API_KEY;
  if (!words || !eleven) {
    res.status(words ? 503 : 400).json({ error: words ? 'No voice configured.' : '`text` is required.', code: words ? 'not_configured' : 'bad_request' });
    return;
  }
  try {
    const out = await synthesizeSpeech(words, TV_VOICE, eleven, 400);
    if (!('audio' in out)) {
      const quota = 'quota' in out && out.quota;
      res.status(quota ? 429 : 502).json({ error: 'Voice unavailable.', code: quota ? 'quota' : 'upstream' });
      return;
    }
    res.set('Content-Type', 'audio/mpeg').send(out.audio);
  } catch (err: unknown) {
    logEvent({ level: 'error', scope: 'tv-speak', message: err instanceof Error ? err.message : 'speak failed' });
    res.status(502).json({ error: 'Voice unavailable.', code: 'upstream' });
  }
});

// ---- Pairing and the TV's live link ---------------------------------------------------------------
// The phone page (ascend.../tv) and the TV talk through Firestore: the page writes commands to
// users/{uid}/tvCmds, the TV listens live and reports users/{uid}/tvState. To do that the TV signs in
// with a custom token carrying tv:true, which firestore.rules limit to those two collections.
// Pairing ties a TV key to an account once: the TV shows a 6-digit code, the signed-in page sends it.

function keyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function adminAuth(): Promise<{
  verifyIdToken: (t: string) => Promise<{ uid: string }>;
  createCustomToken: (uid: string, claims?: Record<string, unknown>) => Promise<string>;
} | null> {
  if (!(await getAdminDb())) return null; // also initialises the admin app
  const authPkg = 'firebase-admin/auth';
  const { getAuth } = (await import(authPkg)) as { getAuth: () => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  return getAuth();
}

/** TV: a 6-digit pairing code (10 minutes), or paired:true when this TV already belongs to someone. */
tvRouter.post('/pair-code', async (req: Request, res: Response) => {
  const { key } = (req.body ?? {}) as { key?: unknown };
  if (!keyOk(key)) { res.status(401).json({ error: 'TV key not accepted.' }); return; }
  const db = await getAdminDb();
  if (!db) { res.status(503).json({ error: 'Pairing is not configured.' }); return; }
  const h = keyHash(String(key));
  if ((await db.doc(`tvPairs/${h}`).get()).exists) { res.json({ paired: true }); return; }
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await db.doc(`tvPairCodes/${code}`).create({ keyHash: h, expires: Date.now() + 10 * 60_000 });
      res.json({ paired: false, code });
      return;
    } catch { /* code taken: try another */ }
  }
  res.status(503).json({ error: 'Could not make a code. Try again.' });
});

/** Phone page (signed in to Ascend): claims the TV whose code it was shown. */
tvRouter.post('/pair', async (req: Request, res: Response) => {
  const auth = await adminAuth();
  const db = await getAdminDb();
  if (!auth || !db) { res.status(503).json({ error: 'Pairing is not configured.' }); return; }
  let uid = '';
  try {
    uid = (await auth.verifyIdToken(String(req.headers.authorization ?? '').replace(/^Bearer /, ''))).uid;
  } catch { res.status(401).json({ error: 'Sign in to Ascend first.' }); return; }
  const code = String((req.body ?? {}).code ?? '').replace(/\D/g, '');
  if (code.length !== 6) { res.status(400).json({ error: 'Type the 6 digits shown on the TV.' }); return; }
  const snap = await db.doc(`tvPairCodes/${code}`).get();
  const data = snap.data();
  if (!snap.exists || !data || Number(data.expires) < Date.now()) { res.status(404).json({ error: 'That code is wrong or expired. Check the TV.' }); return; }
  await db.doc(`tvPairs/${String(data.keyHash)}`).set({ uid, pairedAt: new Date().toISOString() });
  await db.doc(`tvPairCodes/${code}`).delete();
  res.json({ ok: true });
});

/** TV: a Firebase custom token (tv:true) for its owner's account, once paired. */
tvRouter.post('/session', async (req: Request, res: Response) => {
  const { key } = (req.body ?? {}) as { key?: unknown };
  if (!keyOk(key)) { res.status(401).json({ error: 'TV key not accepted.' }); return; }
  const auth = await adminAuth();
  const db = await getAdminDb();
  if (!auth || !db) { res.status(503).json({ error: 'Pairing is not configured.' }); return; }
  const pair = (await db.doc(`tvPairs/${keyHash(String(key))}`).get()).data();
  if (!pair || !pair.uid) { res.json({ paired: false }); return; }
  const uid = String(pair.uid);
  res.json({ paired: true, uid, token: await auth.createCustomToken(uid, { tv: true }) });
});
