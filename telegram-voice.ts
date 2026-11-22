/**
 * Telegram's spoken replies and the task copy to Muse, for the webhook.
 *
 * Voice: when the user sends a voice note, Jarvis answers in its ElevenLabs
 * voice (Daniel by default, same as the app; TELEGRAM_VOICE_ID overrides),
 * as a voice message with the words as its caption.
 *
 * Muse: a message that is a task (see src/features/jarvis/museTasks.ts) is
 * also written to users/{uid}/coach-inbox for Muse to pick up. Jarvis never
 * reads it back; Muse closes it itself.
 */
import type { getAdminDb } from './admin-db';
import { serverTimestamp } from './admin-db';
import { logEvent } from './server-log';
import { synthesizeSpeech } from './tts-routes';
import { sendTelegramMessage, sendTelegramVoice } from './telegram-send';

type AdminDb = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

export type TelegramChannel = 'telegram-voice' | 'telegram-text';

const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';
const SPOKEN_MAX_CHARS = 1500;

/**
 * Speaks `text` as a voice message. If voice can't be made (no ElevenLabs
 * key, quota spent, outage) the same words go as normal text instead, so a
 * reply is never lost.
 */
export async function speakOnTelegram(token: string, chatId: number, text: string): Promise<void> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (key) {
    try {
      const voiceId = process.env.TELEGRAM_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
      const speech = await synthesizeSpeech(text, voiceId, key, SPOKEN_MAX_CHARS);
      if ('audio' in speech) {
        const fitsCaption = text.length <= 1024;
        await sendTelegramVoice(token, chatId, speech.audio, fitsCaption ? text : undefined);
        if (!fitsCaption) await sendTelegramMessage(token, chatId, text);
        return;
      }
    } catch (err) {
      logEvent({ level: 'warn', scope: 'telegram', message: `voice reply failed, sending text: ${(err as Error).message}` });
    }
  }
  await sendTelegramMessage(token, chatId, text);
}

/**
 * Copies a task to Muse. The doc id comes from Telegram's update_id, so if
 * Telegram resends the same message, the second write finds it already there
 * instead of handing Muse the task twice. True when Muse has it.
 */
export async function mirrorTaskToMuse(
  db: AdminDb | null,
  uid: string,
  updateId: number | undefined,
  text: string,
  channel: TelegramChannel,
): Promise<boolean> {
  if (!db) return false;
  const ref = db.doc(`users/${uid}/coach-inbox/tg-${updateId ?? Date.now()}`);
  try {
    await ref.create({ text, createdAt: await serverTimestamp(), status: 'pending', channel });
    return true;
  } catch (err) {
    try {
      if ((await ref.get()).exists) return true; // a retried update, already handed over
    } catch {
      /* fall through to the failure below */
    }
    logEvent({ level: 'error', scope: 'telegram', message: `copy to Muse failed: ${(err as Error).message}` });
    return false;
  }
}
