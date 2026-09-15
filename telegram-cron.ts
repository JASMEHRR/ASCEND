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
 *   - price alerts — Yahoo Finance, direct from Vercel (no loopback problem
 *                    here; unlike Post Studio this is a real internet host).
 *                    One-shot: fires once, then marked firedAt rather than
 *                    deleted, so a re-run in the same cycle can't double-fire
 *                    it if the price hasn't moved back.
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
import { fetchQuote } from './stocks-routes';
import { sendTelegramMessage as send } from './telegram-send';
import { collectCalendarAlerts } from './google-oauth-routes';

/** Past this, the desktop mirror is treated as too old to raise alerts from. */
const MIRROR_FRESH_MINUTES = 30;

interface NotifyState {
  /** Ids/keys already sent, so nothing fires twice. */
  seen?: string[];
  lastRunAt?: string;
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
    console.warn(`[telegram-cron] reminders: ${snap.docs.length} doc(s) in collection`);
    for (const d of snap.docs) {
      const r = d.data() as {
        text?: string;
        dueAt?: string;
        done?: boolean;
        notified?: boolean;
        repeatMinutes?: number;
      };
      if (r.done || r.notified) {
        console.warn(`[telegram-cron] ${d.id} skipped: done=${r.done} notified=${r.notified}`);
        continue;
      }
      if (!r.dueAt || Date.parse(r.dueAt) > now) {
        console.warn(`[telegram-cron] ${d.id} skipped: dueAt=${r.dueAt} parsed=${Date.parse(r.dueAt ?? '')} now=${now} notYetDue=${Date.parse(r.dueAt ?? '') > now}`);
        continue;
      }
      console.warn(`[telegram-cron] ${d.id} FIRING: ${r.text}`);
      messages.push(`⏰ **Reminder:** ${r.text ?? '(untitled)'}`);
      // Recurring reminders reschedule instead of staying fired — same
      // behavior as jarvis-desktop's own timer, so whichever surface catches
      // a given firing advances it identically rather than one path leaving
      // it dead.
      if (r.repeatMinutes && r.repeatMinutes > 0) {
        const nextDue = new Date(now + r.repeatMinutes * 60000).toISOString();
        await db.doc(`users/${uid}/reminders/${d.id}`).update({ dueAt: nextDue, notified: false });
      } else {
        await db.doc(`users/${uid}/reminders/${d.id}`).update({ notified: true });
      }
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
          messages.push(`📧 **Important email:** ${m.subject ?? '(no subject)'}`);
          newlySeen.push(key);
        }

        const classwork = data.classwork as { outstanding?: { id?: string; title?: string; due?: string }[] } | undefined;
        for (const a of classwork?.outstanding ?? []) {
          const key = `classwork:${a.id ?? a.title ?? ''}`;
          if (!a.title || seen.has(key)) continue;
          messages.push(`📚 **Assignment:** ${a.title}${a.due ? ` — due ${a.due}` : ''}`);
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

  // ── next lesson (timetable) ─────────────────────────────────────────────
  // A recurring weekly schedule, not one-shot reminders — see
  // src/features/timetable/types.ts. Computed fresh each pass rather than
  // materialised into `reminders`, so editing the timetable takes effect
  // immediately with nothing stale left behind from the old schedule.
  try {
    const snap = await db.doc(`users/${uid}/timetable/main`).get();
    if (snap.exists) {
      const data = snap.data() as { lessons?: { day?: number; start?: string; subject?: string; room?: string }[]; timeZone?: string };
      const tz = data.timeZone || 'UTC';
      const now = new Date();
      // "day HH:MM" in the user's own zone — Node's Intl has zone data built
      // in, no extra dependency needed for what is otherwise a one-liner.
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const WEEKDAY_NUM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const today = WEEKDAY_NUM[get('weekday')];
      const nowHM = `${get('hour').padStart(2, '0')}:${get('minute').padStart(2, '0')}`;
      const dateKey = now.toISOString().slice(0, 10);

      for (const l of data.lessons ?? []) {
        if (l.day !== today || !l.start || !l.subject) continue;
        // Fires the pass whose "5 minutes before" clock-time matches now,
        // within the cron's own polling granularity rather than an exact
        // instant — see the granularity note in this file's header.
        const [h, m] = l.start.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        const startMin = h * 60 + m;
        const [nh, nm] = nowHM.split(':').map(Number);
        const nowMin = nh * 60 + nm;
        const until = startMin - nowMin;
        if (until < 0 || until > 6) continue; // window: due now through 6 min out

        const key = `lesson:${dateKey}:${l.day}:${l.start}:${l.subject}`;
        if (seen.has(key)) continue;
        messages.push(`🎓 **${l.subject}** starts at ${l.start}${l.room ? ` (${l.room})` : ''} — ${until <= 0 ? 'now' : `in ${until} min`}.`);
        newlySeen.push(key);
      }
      checked.push(`timetable (${(data.lessons ?? []).length} lessons, today=${today})`);
    } else {
      checked.push('no timetable set');
    }
  } catch (err) {
    console.warn('[telegram-cron] timetable failed:', (err as Error).message);
  }

  // ── calendar events (server-side Google OAuth) ──────────────────────────
  // Distinct from the timetable above: one-off Google Calendar events rather
  // than a recurring weekly grid. Silently no-ops if Calendar was never
  // connected (see google-oauth-routes.ts) — nothing to check, nothing sent.
  try {
    const summary = await collectCalendarAlerts(db, uid, seen, messages, newlySeen);
    checked.push(summary);
  } catch (err) {
    console.warn('[telegram-cron] calendar failed:', (err as Error).message);
  }

  // ── price alerts ────────────────────────────────────────────────────────
  try {
    const snap = await db.collection(`users/${uid}/priceAlerts`).get();
    const active = snap.docs.filter((d) => !(d.data() as { firedAt?: string | null }).firedAt);
    for (const d of active) {
      const a = d.data() as { symbol?: string; target?: number; direction?: string };
      if (!a.symbol || typeof a.target !== 'number') continue;
      const quote = await fetchQuote(a.symbol);
      if (!quote) continue; // upstream hiccup — try again next pass, don't fire on missing data
      const crossed =
        a.direction === 'above' ? quote.price >= a.target : quote.price <= a.target;
      if (!crossed) continue;
      messages.push(`📈 **${a.symbol}** hit **${quote.price}** (${a.direction} ${a.target})`);
      await db.doc(`users/${uid}/priceAlerts/${d.id}`).update({ firedAt: new Date().toISOString() });
    }
    checked.push(`priceAlerts (${active.length} active)`);
  } catch (err) {
    console.warn('[telegram-cron] priceAlerts failed:', (err as Error).message);
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
