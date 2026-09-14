/**
 * Telegram — two-way texting with Jarvis from a phone, no browser tab or
 * Electron app involved. The bot token stays server-side (same rule as
 * every other secret in this app); the client never touches Telegram's API
 * directly.
 *
 * Setup (all one-time, done once by whoever owns this deployment):
 *   1. Message @BotFather on Telegram, /newbot, get a token ->
 *      TELEGRAM_BOT_TOKEN.
 *   2. Message your new bot once from your own account, then visit
 *      https://api.telegram.org/bot<token>/getUpdates and read
 *      result[0].message.chat.id -> TELEGRAM_CHAT_ID. Only this chat id is
 *      ever answered; every other chat is silently ignored — this app is
 *      single-user by design, matching the rest of Ascend.
 *   3. Pick any random string -> TELEGRAM_WEBHOOK_SECRET.
 *   4. Set FIREBASE_SERVICE_ACCOUNT if it isn't already (see admin-db.ts) —
 *      required for this route specifically, since there's no client session
 *      to read Firestore from.
 *   5. Set ASCEND_UID to your own Firebase Auth uid (Firebase console ->
 *      Authentication -> Users -> your row's "User UID" column).
 *   6. Register the webhook once, after deploying:
 *      curl "https://api.telegram.org/bot<token>/setWebhook?url=https://<your-domain>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 *
 * Scope: reads Arena/reminders live, plus Post Studio's inbox/classwork/apply
 * status via the Firestore mirror jarvis-desktop writes (Post Studio itself is
 * loopback-only and unreachable from Vercel — see telegram-context.ts).
 * Writes go through telegram-tools.ts, executed server-side here since this
 * surface has no client to run them. Deliberately limited to Ascend's own
 * Firestore: nothing here publishes anywhere or touches the user's laptop.
 */
import { Router, type Request, type Response } from 'express';
import { getAdminDb } from './admin-db';
import { buildTelegramContext } from './telegram-context';
import { runJarvisTurn } from './jarvis-routes';
import { logEvent } from './server-log';
import { TELEGRAM_TOOLS, runTelegramTool } from './telegram-tools';

export const telegramRouter = Router();

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_HISTORY = 20; // messages kept, not turns — matches jarvis-routes' own history.slice(-24)

interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
}

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  // Telegram rejects empty text and hard-caps at 4096 chars per message.
  const body = (text || '(no reply)').slice(0, 4096);
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage failed: ${res.status} ${detail.slice(0, 200)}`);
  }
}

telegramRouter.post('/webhook', async (req: Request, res: Response) => {
  // Ack Telegram immediately in every branch below — it isn't waiting on our
  // outbound sendMessage call, only on this response, and a slow/failed ack
  // makes Telegram retry the same update.
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const expectedChatId = Number(process.env.TELEGRAM_CHAT_ID);
    const uid = process.env.ASCEND_UID;
    if (!token || !expectedChatId || !uid) {
      logEvent({ level: 'warn', scope: 'telegram', message: 'webhook hit but not configured' });
      res.status(503).json({ error: 'Telegram integration is not configured.' });
      return;
    }

    // Telegram echoes this header back on every webhook call once set via
    // setWebhook's secret_token — the only thing standing between "anyone
    // who finds this URL" and a real reply from Jarvis.
    const secretHeader = req.header('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      res.status(401).end();
      return;
    }

    const update = req.body as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;

    // Ack and silently drop anything not from the one authorized chat —
    // this app is single-user, and a stranger finding the bot should get
    // nothing back, not an error that confirms the bot exists.
    if (chatId !== expectedChatId) {
      res.status(200).end();
      return;
    }
    if (!text) {
      await sendTelegramMessage(token, chatId, "I can only read text messages right now.");
      res.status(200).end();
      return;
    }

    const db = await getAdminDb();
    const threadRef = db?.doc(`users/${uid}/telegramThread/main`);
    const threadSnap = await threadRef?.get();
    const priorHistory = (threadSnap?.exists ? threadSnap.data()?.messages : []) as
      | { role: string; content: string }[]
      | undefined;
    const history = [...(priorHistory ?? []), { role: 'user', content: text }];

    const appContext = await buildTelegramContext(uid);
    const turn = await runJarvisTurn(
      history,
      {
        now: new Date().toString(),
        surface: 'Telegram (phone, text-only). You can set reminders and add/tick habits from here.',
        ...appContext,
      },
      TELEGRAM_TOOLS,
    );

    // Executed here rather than client-side, because this surface has no
    // client. Same one-shot shape every other Ascend surface uses: the reply
    // was written before these ran, so their results are appended rather than
    // folded into it.
    const results: string[] = [];
    for (const call of turn.toolCalls) {
      results.push(await runTelegramTool(uid, call));
    }
    const replyText = results.length ? `${turn.reply}

✓ ${results.join(' · ')}` : turn.reply;

    await sendTelegramMessage(token, chatId, replyText);

    // Admin SDK writes bypass firestore.rules entirely — this collection was
    // never meant to be client-readable, same reasoning as _logs in server-log.ts.
    if (threadRef) {
      const updated = [...history, { role: 'assistant', content: replyText }].slice(-MAX_HISTORY);
      await threadRef.set?.({ messages: updated, updatedAt: new Date().toISOString() });
    }

    res.status(200).end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Telegram webhook failed';
    logEvent({ level: 'error', scope: 'telegram', message });
    // Previously this just logged and went silent — the message vanished
    // with no sign it ever arrived. Best-effort notify instead: if the
    // token/chat id were ever readable this far, at least say something
    // broke, rather than leaving the user wondering if Telegram ate it.
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = Number(process.env.TELEGRAM_CHAT_ID);
    if (token && chatId) {
      try {
        await sendTelegramMessage(token, chatId, `Something went wrong on my end: ${message}`);
      } catch {
        /* the original error is already logged; a second failure here isn't worth surfacing */
      }
    }
    // Still 200 to Telegram itself — retries on non-2xx, and a retry won't
    // fix a model/Firestore failure, just resend the same message pointlessly.
    res.status(200).end();
  }
});
