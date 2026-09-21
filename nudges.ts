/**
 * Scheduled habit and study nudges for Telegram.
 *
 * Every nudge is tied to a clock time in the user's own zone (see
 * src/features/telegram/prefs.ts) and fires at most once per local day. The
 * cron is pinged roughly every 5 minutes, so each nudge gets a 15-minute
 * window: wide enough that a slow or skipped ping still lands it, and the
 * per-day key makes a second hit inside the window a no-op.
 *
 * planNudges is pure (no Firestore, no clock of its own) so the scheduling
 * rules are testable — see nudges.test.ts. collectNudges is the thin loader.
 *
 * Habit state reuses Arena's own pure logic, the same way telegram-context.ts
 * does, so "done" here can never disagree with the app:
 *   good habit — done when today's value reaches its target
 *   bad habit  — value 0 = avoided, >= 1 = did it, no entry = not logged yet
 */
import { activeHabits } from './src/features/arena/logic/tiles';
import { compareHabits, slotOf } from './src/features/arena/logic/slots';
import type { Habit, HabitSlot } from './src/features/arena/logic/types';
import { attendanceSubject } from './src/features/attendance/subjectRules';
import type { TelegramPrefs } from './src/features/telegram/prefs';
import { hhmmToMinutes, to12h, type LocalClock } from './src/lib/time';

const WINDOW_MIN = 15;
/** How long after the last class ends before the "revise now" nudge. */
const POST_CLASS_DELAY_MIN = 30;

export interface NudgeLesson {
  day?: number;
  start?: string;
  end?: string;
  subject?: string;
  room?: string;
}

export interface NudgeInput {
  clock: LocalClock;
  prefs: TelegramPrefs;
  /** All habits (inactive ones are filtered here); undefined when not loaded. */
  habits: Habit[] | undefined;
  /** Today's arenaDays values, habitId -> reps. */
  values: Record<string, number>;
  lessons: NudgeLesson[];
  seen: Set<string>;
}

function inWindow(clock: LocalClock, hhmm: string): boolean {
  const t = hhmmToMinutes(hhmm);
  return Number.isFinite(t) && clock.minutes >= t && clock.minutes < t + WINDOW_MIN;
}

/** Habit-nudge keys whose window is open right now and that haven't fired today. */
export function dueHabitNudges(clock: LocalClock, prefs: TelegramPrefs, seen: Set<string>): string[] {
  if (!prefs.habitNudges) return [];
  const slots: [string, string][] = [
    ['morning', prefs.wakeTime],
    ['midday', prefs.middayTime],
    ['evening', prefs.eveningTime],
    ['night', prefs.nightTime],
  ];
  return slots
    .filter(([, time]) => inWindow(clock, time))
    .map(([name]) => `nudge:${name}:${clock.dateKey}`)
    .filter((key) => !seen.has(key));
}

function lessonsOn(lessons: NudgeLesson[], weekday: number): NudgeLesson[] {
  return lessons
    .filter((l) => l.day === weekday && l.start && l.subject)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
}

/** Subjects worth revising, in class order: Free/Field Work dropped, SIP + Mentor Meeting merged. */
function studySubjects(lessons: NudgeLesson[]): string[] {
  const out: string[] = [];
  for (const l of lessons) {
    const s = attendanceSubject(l.subject ?? '');
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function target(h: Habit): number {
  return h.target && h.target > 0 ? h.target : 1;
}

function describe(h: Habit, values: Record<string, number>): string {
  const t = target(h);
  if (t <= 1) return h.label;
  return `${h.label} (${values[h.id] ?? 0}/${t}${h.unit ? ` ${h.unit}` : ''})`;
}

const REPLY_HINT = 'Reply `done <habit>` here to log one.';

export function planNudges(input: NudgeInput): { messages: string[]; keys: string[] } {
  const { clock, prefs, values, lessons, seen } = input;
  const messages: string[] = [];
  const keys: string[] = [];
  const fire = (key: string, text: string) => {
    messages.push(text);
    keys.push(key);
  };

  const today = lessonsOn(lessons, clock.weekday);
  const active = input.habits ? activeHabits(input.habits, clock.dateKey).sort(compareHabits) : [];
  const good = active.filter((h) => h.kind !== 'bad');
  const bad = active.filter((h) => h.kind === 'bad');
  const pendingIn = (slots: HabitSlot[]) =>
    good.filter((h) => slots.includes(slotOf(h)) && (values[h.id] ?? 0) < target(h));
  const list = (hs: Habit[]) => hs.map((h) => describe(h, values)).join(', ');

  for (const key of dueHabitNudges(clock, prefs, seen)) {
    const name = key.split(':')[1];

    if (name === 'morning') {
      const lines = ['☀️ **Good morning.**'];
      const classes = today.filter((l) => !/^free$/i.test((l.subject ?? '').trim()));
      if (prefs.studyNudges && classes.length > 0) {
        const first = classes[0];
        lines.push(
          `📚 ${classes.length} class${classes.length === 1 ? '' : 'es'} today, first is **${first.subject}** at ${to12h(first.start ?? '')}.`,
        );
      }
      const morning = pendingIn(['morning']);
      if (morning.length > 0) lines.push(`Morning habits: ${list(morning)}.`);
      if (lines.length > 1) fire(key, lines.join('\n'));
      else keys.push(key); // nothing to say today; mark it so it isn't re-evaluated
      continue;
    }

    if (name === 'midday' || name === 'evening') {
      const pending = pendingIn(name === 'midday' ? ['day', 'anytime'] : ['evening']);
      if (pending.length === 0) {
        keys.push(key);
        continue;
      }
      const head = name === 'midday' ? '🕐 **Midday check.**' : '🌆 **Evening habits.**';
      fire(key, `${head} Still to do: ${list(pending)}.\n${REPLY_HINT}`);
      continue;
    }

    // night: the whole day, including bad habits nobody has logged yet
    const total = good.length + bad.length;
    if (total === 0) {
      keys.push(key);
      continue;
    }
    const doneGood = good.filter((h) => (values[h.id] ?? 0) >= target(h)).length;
    // Only reward_avoid/both show an "Avoided" button in ArenaToday; for the
    // others (penalty_do, or legacy habits with no mode) not doing it is the
    // success state, and there is nothing to log.
    const loggable = (h: Habit) => h.badMode === 'reward_avoid' || h.badMode === 'both';
    const badCleared = bad.filter((h) => (loggable(h) ? values[h.id] === 0 : (values[h.id] ?? 0) < 1)).length;
    const cleared = doneGood + badCleared;
    const openGood = pendingIn(['morning', 'day', 'evening', 'control', 'anytime']);
    const unlogged = bad.filter((h) => loggable(h) && values[h.id] === undefined);
    if (cleared === total) {
      fire(key, `🌙 **${cleared}/${total} today.** Clean sweep, well done.`);
      continue;
    }
    const lines = [`🌙 **Day check:** ${cleared}/${total} done.`];
    if (openGood.length > 0) lines.push(`Still open: ${list(openGood)}.`);
    if (unlogged.length > 0) lines.push(`Log whether you avoided: ${unlogged.map((h) => h.label).join(', ')}.`);
    lines.push(REPLY_HINT);
    fire(key, lines.join('\n'));
  }

  if (prefs.studyNudges) {
    // Revise while it's fresh: shortly after the last class of the day.
    const subjects = studySubjects(today);
    if (subjects.length > 0) {
      const lastEnd = Math.max(
        ...today.map((l) => {
          const end = hhmmToMinutes(l.end ?? '');
          return Number.isFinite(end) ? end : hhmmToMinutes(l.start ?? '') + 60;
        }),
      );
      const key = `study:postclass:${clock.dateKey}`;
      const t = lastEnd + POST_CLASS_DELAY_MIN;
      if (!seen.has(key) && clock.minutes >= t && clock.minutes < t + WINDOW_MIN) {
        fire(key, `🎒 **Classes are done.** Revise while it's fresh: ${subjects.join(', ')}.`);
      }
    }

    const key = `study:evening:${clock.dateKey}`;
    if (!seen.has(key) && inWindow(clock, prefs.studyTime)) {
      const tomorrow = studySubjects(lessonsOn(lessons, (clock.weekday + 1) % 7));
      fire(
        key,
        tomorrow.length > 0
          ? `📚 **Study time.** Tomorrow you have ${tomorrow.join(', ')}. Go over them tonight.`
          : "📚 **Study time.** No classes tomorrow, so it's a good night for a longer session.",
      );
    }
  }

  return { messages, keys };
}

interface NudgeDb {
  collection: (path: string) => { get: () => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }> };
  doc: (path: string) => { get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }> };
}

/**
 * Loads only what's due: habits are read just when a habit window is open,
 * so the other ~280 passes a day cost nothing beyond the cron's own reads.
 */
export async function collectNudges(
  db: NudgeDb,
  uid: string,
  clock: LocalClock,
  prefs: TelegramPrefs,
  lessons: NudgeLesson[],
  seen: Set<string>,
  messages: string[],
  newlySeen: string[],
): Promise<string> {
  let habits: Habit[] | undefined;
  let values: Record<string, number> = {};
  if (dueHabitNudges(clock, prefs, seen).length > 0) {
    const [habitsSnap, daySnap] = await Promise.all([
      db.collection(`users/${uid}/arenaHabits`).get(),
      db.doc(`users/${uid}/arenaDays/${clock.dateKey}`).get(),
    ]);
    habits = habitsSnap.docs.map((d) => ({ id: d.id, playerId: uid, ...d.data() }) as Habit);
    values = ((daySnap.exists ? daySnap.data()?.values : undefined) as Record<string, number> | undefined) ?? {};
  }
  const planned = planNudges({ clock, prefs, habits, values, lessons, seen });
  messages.push(...planned.messages);
  newlySeen.push(...planned.keys);
  return `nudges (${planned.messages.length} queued)`;
}
