/**
 * The bot's half of the Muse bridge (rules in coach-inbox.ts).
 *
 *   user -> Telegram voice/text -> users/{uid}/coach-inbox/tg-{update_id}
 *          { text, createdAt, status: 'pending', channel }
 *   Muse (Admin SDK) -> same doc: { reply, status: 'answered', answeredAt }
 *   bot -> speaks `reply` in Jarvis's ElevenLabs voice -> status 'delivered'
 *
 * Vercel functions can't hold a Firestore listener open, so "watching" is:
 *   1. the webhook waits up to ~45s for a quick reply and speaks it at once;
 *   2. every scheduled pass (/api/telegram/cron, pinged every few minutes)
 *      and /api/telegram/coach-deliver pick up anything answered later, and
 *      send the one-time "Muse hasn't answered yet" notice after 10 minutes.
 * Each delivery is claimed with an atomic create() on a lock doc first, so
 * the webhook and a scheduled pass can never both speak the same reply.
 *
 * Only ever touches users/{uid} for the one uid this deployment serves
 * (ASCEND_UID, the owner of the single authorised Telegram chat).
 * Never falls back to an LLM: if Muse doesn't answer, the user is told so.
 */
import { getAdminDb, serverTimestamp } from './admin-db';
import { logEvent } from './server-log';
import { synthesizeSpeech } from './tts-routes';
import { sendTelegramMessage, sendTelegramVoice, sendTyping } from './telegram-send';
import { readyReply, needsLateNotice, type CoachChannel, type CoachInboxDoc } from './coach-inbox';

type AdminDb = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

const inboxPath = (uid: string) => `users/${uid}/coach-inbox`;
const lockPath = (uid: string, key: string) => `users/${uid}/coachDelivery/${key}`;

/** Jarvis's default ElevenLabs voice (Daniel), same as the app's; TELEGRAM_VOICE_ID overrides it. */
const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';
/** Muse writes short spoken replies; this only stops a runaway one burning the voice quota. */
const SPOKEN_MAX_CHARS = 1500;
/** How long the webhook itself waits for a quick reply, from when Telegram called it. */
export const COACH_WAIT_MS = 45_000;
const POLL_MS = 2_000;

const LATE_NOTICE = "Muse hasn't answered yet. I'll pass the reply on as soon as it comes in.";

/**
 * Says `text` in the bot's voice: an mp3 voice message with the words as its
 * caption. If voice can't be made (no ElevenLabs key, quota spent, outage),
 * sends the same words as text and says so, rather than going quiet.
 */
export async function speakToUser(token: string, chatId: number, text: string): Promise<'voice' | 'text'> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (key) {
    try {
      const voiceId = process.env.TELEGRAM_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
      const speech = await synthesizeSpeech(text, voiceId, key, SPOKEN_MAX_CHARS);
      if ('audio' in speech) {
        const fitsCaption = text.length <= 1024;
        await sendTelegramVoice(token, chatId, speech.audio, fitsCaption ? text : undefined);
        if (!fitsCaption) await sendTelegramMessage(token, chatId, text);
        return 'voice';
      }
    } catch (err) {
      logEvent({ level: 'warn', scope: 'coach', message: `voice failed, sending text: ${(err as Error).message}` });
    }
  }
  await sendTelegramMessage(token, chatId, `(Voice unavailable right now, so here it is as text.)\n\n${text}`);
  return 'text';
}

/**
 * Writes the pending inbox doc. The id comes from Telegram's update_id, so a
 * webhook retry of the same message finds the doc already there and returns
 * null instead of creating a second one.
 */
export async function writeCoachInbox(
  db: AdminDb,
  uid: string,
  updateId: number,
  text: string,
  channel: CoachChannel,
): Promise<string | null> {
  const id = `tg-${updateId}`;
  const ref = db.doc(`${inboxPath(uid)}/${id}`);
  try {
    await ref.create({ text, createdAt: await serverTimestamp(), status: 'pending', channel });
    return id;
  } catch (err) {
    if ((await ref.get()).exists) return null;
    throw err;
  }
}

/** Claims a one-time action on an inbox doc. False when someone already did it. */
async function claim(db: AdminDb, uid: string, key: string): Promise<ReturnType<AdminDb['doc']> | null> {
  const lock = db.doc(lockPath(uid, key));
  try {
    await lock.create({ at: new Date().toISOString() });
    return lock;
  } catch {
    return null;
  }
}

/** Speaks one answered reply and marks it delivered. False if another pass got there first. */
async function deliverAnswered(db: AdminDb, uid: string, token: string, chatId: number, id: string, reply: string): Promise<boolean> {
  const lock = await claim(db, uid, id);
  if (!lock) return false;
  try {
    await speakToUser(token, chatId, reply);
  } catch (err) {
    // Nothing reached the user, so release the claim and let the next pass retry.
    await lock.delete().catch(() => undefined);
    throw err;
  }
  // Spoken. From here a failure must not release the lock, or the next pass would say it twice.
  await db.doc(`${inboxPath(uid)}/${id}`).update({ status: 'delivered', deliveredAt: await serverTimestamp() });
  return true;
}

/**
 * The scheduled half: speaks every answered reply not yet delivered, and
 * sends the 10-minute notice for anything Muse hasn't picked up. Returns how
 * many messages went out. Per-doc failures are logged, not thrown, so one bad
 * doc can't block the rest.
 */
export async function deliverCoachReplies(db: AdminDb, uid: string, token: string, chatId: number): Promise<number> {
  let sent = 0;
  const col = db.collection(inboxPath(uid));

  const answered = await col.where('status', '==', 'answered').get();
  for (const d of answered.docs) {
    const reply = readyReply(d.data());
    if (!reply) continue;
    try {
      if (await deliverAnswered(db, uid, token, chatId, d.id, reply)) sent += 1;
    } catch (err) {
      logEvent({ level: 'error', scope: 'coach', message: `deliver ${d.id} failed: ${(err as Error).message}` });
    }
  }

  const pending = await col.where('status', '==', 'pending').get();
  const now = Date.now();
  for (const d of pending.docs) {
    if (!needsLateNotice({ id: d.id, ...d.data() } as CoachInboxDoc, now)) continue;
    const lock = await claim(db, uid, `${d.id}-late`);
    if (!lock) continue;
    try {
      await speakToUser(token, chatId, LATE_NOTICE);
    } catch (err) {
      // Not sent: release the claim so the next pass tries again.
      await lock.delete().catch(() => undefined);
      logEvent({ level: 'error', scope: 'coach', message: `late notice ${d.id} failed: ${(err as Error).message}` });
      continue;
    }
    sent += 1;
    try {
      await db.doc(`${inboxPath(uid)}/${d.id}`).update({ lateNoticeAt: await serverTimestamp() });
    } catch (err) {
      logEvent({ level: 'error', scope: 'coach', message: `late notice ${d.id} failed: ${(err as Error).message}` });
    }
  }
  return sent;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The webhook half: files the message for Muse, then waits briefly for a
 * reply so a quick answer is spoken within seconds. A slower one is left for
 * the scheduled passes, and the user is told it's on its way.
 */
export async function handleCoachMessage(opts: {
  db: AdminDb;
  uid: string;
  token: string;
  chatId: number;
  updateId: number;
  text: string;
  channel: CoachChannel;
  startedAt: number;
}): Promise<void> {
  const { db, uid, token, chatId, updateId, text, channel, startedAt } = opts;
  const id = await writeCoachInbox(db, uid, updateId, text, channel);
  if (!id) return; // Telegram retried a message we already filed.
  logEvent({ level: 'info', scope: 'coach', message: `inbox ${id} (${channel})` });

  void sendTyping(token, chatId, 'record_voice');
  const indicator = setInterval(() => void sendTyping(token, chatId, 'record_voice'), 4_000);
  try {
    const deadline = startedAt + COACH_WAIT_MS;
    while (Date.now() + POLL_MS < deadline) {
      await sleep(POLL_MS);
      const snap = await db.doc(`${inboxPath(uid)}/${id}`).get();
      const reply = snap.exists ? readyReply(snap.data() ?? {}) : null;
      if (reply) {
        await deliverAnswered(db, uid, token, chatId, id, reply);
        return;
      }
      if (snap.data()?.status === 'delivered') return; // a scheduled pass beat us to it
    }
  } finally {
    clearInterval(indicator);
  }

  const heard = channel === 'telegram-voice' ? `: "${text.length > 300 ? `${text.slice(0, 300)}…` : text}"` : '';
  await sendTelegramMessage(token, chatId, `Sent to Muse${heard}. The reply will come here as soon as Muse answers.`);
}
