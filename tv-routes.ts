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
import { createHash, timingSafeEqual } from 'node:crypto';
import { runJarvisTurn } from './jarvis-routes';
import { GeminiError } from './llm';
import { logEvent } from './server-log';

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
  try {
    res.json(await runJarvisTurn(history, ctx, TV_TOOLS));
  } catch (err: unknown) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Jarvis request failed';
    logEvent({ level: status >= 500 ? 'error' : 'warn', scope: 'tv-jarvis', message, meta: { status } });
    res.status(status).json({ error: message });
  }
});
