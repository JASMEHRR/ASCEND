/**
 * The user's schedule as the server sees it: Telegram prefs, the weekly
 * timetable, and "now" in the user's own zone. Shared by the cron (which
 * decides what to send) and the Telegram chat context (which answers "when
 * is my next class"), so the two can never disagree about the time or about
 * which classes exist.
 *
 * Vercel's clock is UTC; every day key and weekday here comes from the
 * user's zone instead.
 */
import { resolvePrefs, telegramPrefsPath, type TelegramPrefs } from './src/features/telegram/prefs';
import { localClock, to12h, type LocalClock } from './src/lib/time';
import type { NudgeLesson } from './nudges';

/**
 * Used only when neither the Telegram prefs nor the timetable recorded the
 * browser's zone. Matches the IST assumption telegram-tools.ts already makes.
 */
export const FALLBACK_TZ = 'Asia/Kolkata';

export interface ScheduleInputs {
  prefs: TelegramPrefs;
  /** null = no timetable uploaded yet, as opposed to one with no lessons today. */
  hasTimetable: boolean;
  lessons: NudgeLesson[];
  timeZone: string;
  clock: LocalClock;
}

interface ScheduleDb {
  doc: (path: string) => { get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }> };
}

export async function loadScheduleInputs(db: ScheduleDb, uid: string): Promise<ScheduleInputs> {
  const [prefsSnap, timetableSnap] = await Promise.all([
    db.doc(telegramPrefsPath(uid)).get().catch(() => null),
    db.doc(`users/${uid}/timetable/main`).get().catch(() => null),
  ]);
  const prefs = resolvePrefs(prefsSnap?.exists ? prefsSnap.data() : undefined);
  const timetable = timetableSnap?.exists
    ? (timetableSnap.data() as { lessons?: NudgeLesson[]; timeZone?: string })
    : null;

  let timeZone = prefs.timeZone || timetable?.timeZone || FALLBACK_TZ;
  let clock: LocalClock;
  try {
    clock = localClock(timeZone);
  } catch {
    timeZone = FALLBACK_TZ; // an unrecognised zone string
    clock = localClock(timeZone);
  }
  return { prefs, hasTimetable: timetable !== null, lessons: timetable?.lessons ?? [], timeZone, clock };
}

/**
 * How far back a reminder another surface already showed (the browser or the
 * desktop app set `notified`) still gets its Telegram copy. Beyond this it's
 * history, and sending it now would be noise.
 */
export const REMINDER_CATCHUP_MIN = 60;

export interface ReminderDoc {
  id: string;
  dueAt?: string;
  done?: boolean;
  notified?: boolean;
  repeatMinutes?: number;
}

/**
 * What the cron should do with one reminder, or null for nothing.
 *
 * Telegram tracks its own deliveries (the `key`, kept in the cron's seen
 * list) instead of reading `notified`. `notified` belongs to the browser and
 * desktop popups: when Ascend was open at the due time, the browser used to
 * set it first, and the cron then skipped the reminder, so it never reached
 * Telegram. The browser also never reschedules repeating reminders, so one it
 * fired first stopped for good; `nextDue` restarts those on their original
 * cadence, silently if the missed slot is too old to be worth a text.
 */
export function planReminder(
  r: ReminderDoc,
  now: number,
  seen: Set<string>,
): { send: boolean; key: string; nextDue?: string } | null {
  if (r.done || !r.dueAt) return null;
  const due = Date.parse(r.dueAt);
  if (!Number.isFinite(due) || due > now) return null;

  const key = `reminder:${r.id}:${r.dueAt}`;
  const recent = now - due <= REMINDER_CATCHUP_MIN * 60_000;
  const send = !seen.has(key) && (!r.notified || recent);

  const repeatMs = r.repeatMinutes && r.repeatMinutes > 0 ? r.repeatMinutes * 60_000 : 0;
  const nextDue = repeatMs
    ? new Date(due + (Math.floor((now - due) / repeatMs) + 1) * repeatMs).toISOString()
    : undefined;

  if (!send && !nextDue) return null;
  return { send, key, ...(nextDue ? { nextDue } : {}) };
}

/** One day's lessons in start order, formatted for the chat model to read out. */
export function lessonsForDay(lessons: NudgeLesson[], weekday: number): { time: string; subject: string; room?: string }[] {
  return lessons
    .filter((l) => l.day === weekday && l.start && l.subject)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
    .map((l) => ({
      time: `${to12h(l.start ?? '')}${l.end ? ` to ${to12h(l.end)}` : ''}`,
      subject: l.subject ?? '',
      ...(l.room ? { room: l.room } : {}),
    }));
}

/** Plain-language list of what the background check texts about on its own. */
export function describeAutomaticAlerts(prefs: TelegramPrefs, hasTimetable: boolean): string[] {
  const out: string[] = [];
  out.push(hasTimetable ? 'A text 5 minutes before every lesson in the timetable.' : 'Class alerts, once a timetable is uploaded.');
  out.push('A text when any active price alert crosses its target.');
  out.push('A text when a reminder comes due, and a few minutes before Google Calendar events.');
  if (prefs.emailAlerts) out.push('A text when important unread email arrives (internships, jobs, deadlines, college mail), held overnight.');
  if (prefs.habitNudges) {
    out.push(
      `Habit nudges at ${to12h(prefs.wakeTime)}, ${to12h(prefs.middayTime)} and ${to12h(prefs.eveningTime)}, plus a night check at ${to12h(prefs.nightTime)}.`,
    );
  }
  if (prefs.studyNudges) out.push(`A revise-now text after the last class, and a study reminder at ${to12h(prefs.studyTime)}.`);
  return out;
}
