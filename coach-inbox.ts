/**
 * Pure rules for the Muse bridge (no Firestore, no network), so they run
 * under plain `tsx` in coach-inbox.test.ts. The I/O half is coach-bridge.ts.
 *
 * The bridge: what the user says to the Telegram bot (voice or text) is
 * written to users/{uid}/coach-inbox/{id} as `pending`. Muse, an external
 * agent with Admin SDK access, writes `reply` and sets `answered`; the bot
 * speaks the reply and sets `delivered`.
 */

export type CoachStatus = 'pending' | 'answered' | 'delivered';
export type CoachChannel = 'telegram-voice' | 'telegram-text';

export interface CoachInboxDoc {
  id: string;
  status?: unknown;
  reply?: unknown;
  createdAt?: unknown;
  /** Set once the "Muse hasn't answered yet" notice went out, so it's said only once. */
  lateNoticeAt?: unknown;
}

/** After this long with no reply, the user is told once that Muse hasn't answered. */
export const COACH_LATE_MS = 10 * 60_000;

/** Firestore Timestamp, ISO string or epoch millis to millis; anything else is null. */
export function toMillis(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().getTime();
  return null;
}

/** A reply Muse has finished: status `answered` with non-empty text. */
export function readyReply(doc: Pick<CoachInboxDoc, 'status' | 'reply'>): string | null {
  return doc.status === 'answered' && typeof doc.reply === 'string' && doc.reply.trim() ? doc.reply.trim() : null;
}

/** Still pending past the 10-minute mark, and not yet told about it. */
export function needsLateNotice(doc: CoachInboxDoc, now: number): boolean {
  if (doc.status !== 'pending' || doc.lateNoticeAt) return false;
  const created = toMillis(doc.createdAt);
  return created !== null && now - created >= COACH_LATE_MS;
}

/**
 * "/j ..." or "/jarvis ..." sends a message to Jarvis (reminders, habits,
 * email and the other tools) instead of Muse, so those keep working from
 * Telegram while the bridge is on. Returns the text after the command, or
 * null when the message is for Muse.
 */
export function jarvisCommand(text: string): string | null {
  const m = text.match(/^\/(?:j|jarvis)(?:@\w+)?\s+([\s\S]*\S)/i);
  return m ? m[1].trim() : null;
}

/** The bridge is on unless MUSE_BRIDGE=off, which restores Jarvis answering everything. */
export function museBridgeOn(env: Record<string, string | undefined> = process.env): boolean {
  return (env.MUSE_BRIDGE ?? '').trim().toLowerCase() !== 'off';
}
