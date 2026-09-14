/**
 * Proactive Telegram notifications — the autonomous half of the bridge.
 *
 * Everything else in Ascend is reactive: it answers when spoken to. This runs
 * on a schedule (see vercel.json "crons") with no one asking, decides whether
 * anything is worth interrupting the user about, and texts them if so.
 *
 * What it can see, and why:
 *   - reminders    — Firestore, read directly.
 *   - Post Studio  — only via the mirror jarvis-desktop writes. Post Studio
 *                    itself lives at 127.0.0.1:8765 on the user's laptop and
 *                    is unreachable from Vercel, permanently. If that app has
 *                    been closed a while the mirror is stale, and stale data
 *                    must not produce "you have a new assignment" alerts, so
 *                    freshness is checked before anything fires.
 *
 * Cadence note: Vercel's Hobby plan allows one cron run per day, so the
 * scheduled pass here is a daily morning digest. The endpoint itself is
 * stateless and safe to call as often as you like — any external scheduler
 * (cron-job.org and similar are free) can hit it every 15 minutes with the
 * same CRON_SECRET for near-real-time alerts, with no code change.
 *
 * Two rules govern everything here, because the cost of getting them wrong is
 * a phone that buzzes at 3am for nothing:
 *   1. Never notify twice for the same thing. State lives in
 *      users/{uid}/telegramNotifyState/main.
 *   2. When unsure, stay silent. A missed nudge is recoverable; a spammy bot
 *      gets muted, and then every future nudge is missed too.
 */
import { getAdminDb } from './admin-db';

const TELEGRAM_API = 'https://api.telegram.org';

/** Past this, the desktop mirror is treated as too old to raise alerts from. */
const MIRROR_FRESH_MINUTES = 30;

interface NotifyState {
  /** Ids/keys already sent, so nothing fires twice. */
  seen?: string[];
  lastRunAt?: string;
}

async function send(token: string, chatId: number, text: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`sendMessage ${res.status}`);
}

/**
 * One scheduled pass. Returns a short summary of what it did, for the cron
 * response body and the logs — never throws into the route.
 */
export async function runTelegramCron(
  uid: string,
  token: string,
  chatId: number,
): Promise<{ sent: number; checked: string[] }> {
  const db = await getAdminDb();
  if (!db) return { sent: 0, checked: ['storage unavailable'] };

  const stateRef = db.doc(`users/${uid}/telegramNotifyState/main`);
  const stateSnap = await stateRef.get();
  const state = (stateSnap.exists ? stateSnap.data() : {}) as NotifyState;
  const seen = new Set(state.seen ?? []);

  const messages: string[] = [];
  const newlySeen: string[] = [];
  const checked: string[] = [];

  // ── reminders that have come due ────────────────────────────────────────
  // The desktop app fires these too, but only while it's open. Both paths
  // respect the same `notified` flag, so whichever gets there first wins and
  // the other stays quiet rather than double-buzzing.
  try {
    const snap = await db.collection(`users/${uid}/reminders`).get();
    const now = Date.now();
    for (const d of snap.docs) {
      const r = d.data() as { text?: string; dueAt?: string; done?: boolean; notified?: boolean };
      if (r.done || r.notified) continue;
      if (!r.dueAt || Date.parse(r.dueAt) > now) continue;
      messages.push(`⏰ Reminder: ${r.text ?? '(untitled)'}`);
      await db.doc(`users/${uid}/reminders/${d.id}`).update({ notified: true });
    }
    checked.push('reminders');
  } catch (err) {
    console.warn('[telegram-cron] reminders failed:', (err as Error).message);
  }

  // ── new important email / new classwork, via the desktop mirror ─────────
  try {
    const snap = await db.doc(`users/${uid}/postStudioMirror/latest`).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const mirroredAt = typeof data.mirroredAt === 'string' ? Date.parse(data.mirroredAt) : NaN;
      const ageMin = Number.isNaN(mirroredAt) ? Infinity : (Date.now() - mirroredAt) / 60000;

      if (ageMin > MIRROR_FRESH_MINUTES) {
        // Deliberately silent. An alert derived from hours-old data is worse
        // than no alert: the user acts on it and finds nothing there.
        checked.push(`mirror stale (${Math.round(ageMin)}m) — skipped`);
      } else {
        const inbox = data.inbox as { recent?: { message_id?: string; subject?: string; importance?: string }[] } | undefined;
        for (const m of inbox?.recent ?? []) {
          if (m.importance !== 'important' || !m.message_id) continue;
          const key = `email:${m.message_id}`;
          if (seen.has(key)) continue;
          messages.push(`📧 Important email: ${m.subject ?? '(no subject)'}`);
          newlySeen.push(key);
        }

        const classwork = data.classwork as { outstanding?: { id?: string; title?: string; due?: string }[] } | undefined;
        for (const a of classwork?.outstanding ?? []) {
          const key = `classwork:${a.id ?? a.title ?? ''}`;
          if (!a.title || seen.has(key)) continue;
          messages.push(`📚 Assignment: ${a.title}${a.due ? ` — due ${a.due}` : ''}`);
          newlySeen.push(key);
        }
        checked.push(`mirror fresh (${Math.round(ageMin)}m)`);
      }
    } else {
      checked.push('no mirror yet');
    }
  } catch (err) {
    console.warn('[telegram-cron] mirror failed:', (err as Error).message);
  }

  for (const text of messages) {
    try {
      await send(token, chatId, text);
    } catch (err) {
      console.warn('[telegram-cron] send failed:', (err as Error).message);
    }
  }

  // Cap the seen list so this document can't grow without bound. Oldest keys
  // fall off first; re-alerting on something from 500 items ago is an
  // acceptable worst case, an ever-growing document is not.
  const mergedSeen = [...(state.seen ?? []), ...newlySeen].slice(-500);
  await stateRef.set({ seen: mergedSeen, lastRunAt: new Date().toISOString() });

  return { sent: messages.length, checked };
}
