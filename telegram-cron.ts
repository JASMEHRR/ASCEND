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
 *   - timetable    — lesson starting in ~5 min.
 *   - calendar     — Google Calendar via the server-side refresh token.
 *   - gmail        — unread mail an LLM judges worth a text (gmail-alerts.ts).
 *   - nudges       — habit and study reminders at the user's own times,
 *                    configured in Settings (nudges.ts, telegramPrefs).
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
 * Two passes must never overlap: each reads the seen list before either
 * writes it back, so both would send the same alert. The Vercel schedule is
 * minute 32, off the external pinger's every-5-minutes grid, for that reason.
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
import { collectEmailAlerts } from './gmail-alerts';
import { collectNudges } from './nudges';
import { isQuietTime } from './src/features/telegram/prefs';
import { hhmmToMinutes, to12h } from './src/lib/time';
import { loadScheduleInputs } from './telegram-schedule';

type AdminDb = NonNullable<Awaited<ReturnType<typeof getAdminDb>>>;

/** Past this, the desktop mirror is treated as too old to raise alerts from. */
const MIRROR_FRESH_MINUTES = 30;

/**
 * A pass that holds the lock longer than this is assumed dead. Comfortably
 * longer than any real pass: cron-job.org cuts the request at 30s and Vercel
 * kills the function at 60s.
 */
const LOCK_STALE_MS = 90_000;

/** How many recent runs are kept, so /status can show whether the scheduler is alive. */
const RECENT_RUNS = 30;

interface RunRecord {
  at: string;
  /** Who triggered it: cron-job.org, vercel-cron, or whatever else called. */
  by: string;
  /** Messages Telegram actually accepted. */
  sent: number;
  failed?: number;
}

interface NotifyState {
  /** Ids/keys already sent, so nothing fires twice. */
  seen?: string[];
  lastRunAt?: string;
  recentRuns?: RunRecord[];
}

const statePath = (uid: string) => `users/${uid}/telegramNotifyState/main`;

/**
 * Only one pass at a time. Two passes that overlap (the external pinger plus
 * Vercel's own cron, or a manual check) both read the seen list before
 * either writes it back, so both would send the same alert. `create` fails
 * atomically when the lock doc already exists, which is the whole guard.
 */
export async function acquireLock(
  ref: Pick<ReturnType<AdminDb['doc']>, 'create' | 'get' | 'set'>,
): Promise<boolean> {
  try {
    await ref.create({ at: new Date().toISOString() });
    return true;
  } catch {
    const snap = await ref.get();
    const at = Date.parse(String(snap.data()?.at ?? ''));
    if (snap.exists && Number.isFinite(at) && Date.now() - at < LOCK_STALE_MS) return false;
    // The holder died without releasing it. Take over.
    await ref.set({ at: new Date().toISOString() });
    return true;
  }
}

/**
 * One scheduled pass. Returns a short summary of what it did, for the cron
 * response body and the logs — never throws into the route.
 */
export async function runTelegramCron(
  uid: string,
  token: string,
  chatId: number,
  source = 'unknown',
): Promise<{ sent: number; checked: string[] }> {
  const db = await getAdminDb();
  if (!db) return { sent: 0, checked: ['storage unavailable'] };

  const lock = db.doc(`users/${uid}/telegramNotifyState/lock`);
  if (!(await acquireLock(lock))) return { sent: 0, checked: ['skipped: another pass is still running'] };
  try {
    return await runPass(db, uid, token, chatId, source);
  } finally {
    await lock.delete().catch(() => undefined);
  }
}

async function runPass(
  db: AdminDb,
  uid: string,
  token: string,
  chatId: number,
  source: string,
): Promise<{ sent: number; checked: string[] }> {
  const stateRef = db.doc(statePath(uid));
  const stateSnap = await stateRef.get();
  const state = (stateSnap.exists ? stateSnap.data() : {}) as NotifyState;
  const seen = new Set(state.seen ?? []);

  const messages: string[] = [];
  const newlySeen: string[] = [];
  const checked: string[] = [];

  // Read once and shared: the timetable feeds both lesson alerts and study
  // nudges, and everything decides "now" in the user's own zone.
  const { prefs, hasTimetable, lessons, clock } = await loadScheduleInputs(db, uid);

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
    if (hasTimetable) {
      for (const l of lessons) {
        if (l.day !== clock.weekday || !l.start || !l.subject) continue;
        // Fires the pass whose "5 minutes before" clock-time matches now,
        // within the cron's own polling granularity rather than an exact
        // instant — see the granularity note in this file's header.
        const startMin = hhmmToMinutes(l.start);
        if (Number.isNaN(startMin)) continue;
        const until = startMin - clock.minutes;
        if (until < 0 || until > 6) continue; // window: due now through 6 min out

        const key = `lesson:${clock.dateKey}:${l.day}:${l.start}:${l.subject}`;
        if (seen.has(key)) continue;
        messages.push(
          `🎓 **${l.subject}** starts at ${to12h(l.start)}${l.room ? ` (${l.room})` : ''}, ${until <= 0 ? 'now' : `in ${until} min`}.`,
        );
        newlySeen.push(key);
      }
      checked.push(`timetable (${lessons.length} lessons, today=${clock.weekday})`);
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

  // ── important email, straight from Gmail ────────────────────────────────
  // Held overnight rather than dropped: the query covers the last two days of
  // unread mail, so anything that arrives while asleep is caught at wake time.
  try {
    if (!prefs.emailAlerts) checked.push('gmail off');
    else if (isQuietTime(prefs, clock.minutes)) checked.push('gmail held (quiet hours)');
    else checked.push(await collectEmailAlerts(db, uid, seen, messages, newlySeen));
  } catch (err) {
    console.warn('[telegram-cron] gmail failed:', (err as Error).message);
  }

  // ── habit and study nudges ──────────────────────────────────────────────
  try {
    checked.push(await collectNudges(db, uid, clock, prefs, lessons, seen, messages, newlySeen));
  } catch (err) {
    console.warn('[telegram-cron] nudges failed:', (err as Error).message);
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

  // Counted by what Telegram accepted, not what was queued, so a delivery
  // problem shows up in the run record and /status instead of reading as sent.
  let delivered = 0;
  let failed = 0;
  for (const text of messages) {
    try {
      await send(token, chatId, text);
      delivered += 1;
    } catch (err) {
      failed += 1;
      console.warn('[telegram-cron] send failed:', (err as Error).message);
      if (failed === 1) checked.push(`send failed: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  // Cap the seen list so this document can't grow without bound. Oldest keys
  // fall off first; re-alerting on something from 500 items ago is an
  // acceptable worst case, an ever-growing document is not.
  const mergedSeen = [...(state.seen ?? []), ...newlySeen].slice(-500);
  const now = new Date().toISOString();
  const run: RunRecord = { at: now, by: source, sent: delivered, ...(failed ? { failed } : {}) };
  const recentRuns = [...(state.recentRuns ?? []), run].slice(-RECENT_RUNS);
  await stateRef.set({ seen: mergedSeen, lastRunAt: now, recentRuns });

  return { sent: delivered, checked };
}

/**
 * Read-only health check: is the scheduler actually running, and what is each
 * active price alert waiting for. Runs no pass and sends nothing, so it can
 * be checked any time without triggering the alerts it is checking.
 */
export async function getTelegramStatus(uid: string): Promise<Record<string, unknown>> {
  const db = await getAdminDb();
  if (!db) return { error: 'storage unavailable' };

  const [stateSnap, alertsSnap, remindersSnap, schedule] = await Promise.all([
    db.doc(statePath(uid)).get(),
    db.collection(`users/${uid}/priceAlerts`).get(),
    db.collection(`users/${uid}/reminders`).get(),
    loadScheduleInputs(db, uid),
  ]);
  const local = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { timeZone: schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' });
  const pendingReminders = remindersSnap.docs
    .map((d) => d.data() as { text?: string; dueAt?: string; done?: boolean; notified?: boolean })
    .filter((r) => !r.done && !r.notified && r.dueAt)
    .map((r) => ({ text: r.text, dueAt: local(String(r.dueAt)), overdue: Date.parse(String(r.dueAt)) <= Date.now() }));
  const state = (stateSnap.exists ? stateSnap.data() : {}) as NotifyState;
  const lastRunAt = state.lastRunAt ? Date.parse(state.lastRunAt) : NaN;

  const priceAlerts = await Promise.all(
    alertsSnap.docs
      .map((d) => d.data() as { symbol?: string; target?: number; direction?: string; firedAt?: string | null })
      .filter((a) => !a.firedAt && a.symbol)
      .map(async (a) => {
        const quote = await fetchQuote(String(a.symbol)).catch(() => null);
        const price = quote?.price ?? null;
        const crossed =
          price === null || typeof a.target !== 'number'
            ? null
            : a.direction === 'above'
              ? price >= a.target
              : price <= a.target;
        return { symbol: a.symbol, direction: a.direction, target: a.target, price, crossed };
      }),
  );

  return {
    lastRunAt: state.lastRunAt ?? null,
    minutesSinceLastRun: Number.isFinite(lastRunAt) ? Math.round((Date.now() - lastRunAt) / 60000) : null,
    recentRuns: [...(state.recentRuns ?? [])].reverse(),
    timeZone: schedule.timeZone,
    pendingReminders,
    activePriceAlerts: priceAlerts,
  };
}
