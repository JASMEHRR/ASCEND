/**
 * Telegram nudge scheduling tests — pure, no Firestore or network:
 *
 *   npx tsx nudges.test.ts
 */
import assert from 'node:assert/strict';
import { planNudges, type NudgeInput, type NudgeLesson } from './nudges';
import { DEFAULT_TELEGRAM_PREFS, isQuietTime, resolvePrefs } from './src/features/telegram/prefs';
import { localClock, parseInZone, type LocalClock } from './src/lib/time';
import type { Habit } from './src/features/arena/logic/types';
import { attendanceSubject } from './src/features/attendance/subjectRules';
import { acquireLock } from './telegram-cron';
import { planReminder } from './telegram-schedule';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

const DAY = '2026-09-21'; // a Monday
const at = (hhmm: string, weekday = 1): LocalClock => {
  const [h, m] = hhmm.split(':').map(Number);
  return { dateKey: DAY, weekday, minutes: h * 60 + m };
};

function habit(id: string, label: string, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    playerId: 'u',
    label,
    kind: 'good',
    icon: 'circle',
    color: '#fff',
    startsAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

const HABITS: Habit[] = [
  habit('wake', 'Wake 6:30', { slot: 'morning' }),
  habit('gym', 'Workout', { slot: 'morning' }),
  habit('steps', 'Steps', { slot: 'day', target: 5000, unit: 'steps' }),
  habit('read', 'Reading', { slot: 'evening' }),
  habit('insta', 'Instagram', { kind: 'bad', slot: 'control', badMode: 'both' }),
  habit('chess', 'Blitz Chess', { kind: 'bad', slot: 'control', badMode: 'both' }),
];

const MONDAY: NudgeLesson[] = [
  { day: 1, start: '09:00', end: '10:10', subject: 'AIB' },
  { day: 1, start: '10:15', end: '11:25', subject: 'QTM' },
  { day: 1, start: '11:30', end: '12:40', subject: 'FREE' },
  // Names as they actually appear in the uploaded timetable.
  { day: 1, start: '13:45', end: '14:55', subject: 'SiP-I' },
  { day: 1, start: '15:00', end: '16:10', subject: 'SiP-I MENTOR MEETING' },
  { day: 2, start: '09:00', end: '10:10', subject: 'EMDM' },
  { day: 2, start: '10:15', end: '11:25', subject: 'FIELD WORK' },
];

function run(clock: LocalClock, overrides: Partial<NudgeInput> = {}) {
  return planNudges({
    clock,
    prefs: DEFAULT_TELEGRAM_PREFS,
    habits: HABITS,
    values: {},
    lessons: MONDAY,
    seen: new Set(),
    ...overrides,
  });
}

test('morning nudge fires inside its window with classes and morning habits', () => {
  const out = run(at('07:05'));
  assert.equal(out.messages.length, 1);
  assert.match(out.messages[0], /Good morning/);
  assert.match(out.messages[0], /4 classes today, first is \*\*AIB\*\* at 9:00 AM/);
  assert.match(out.messages[0], /Wake 6:30, Workout/);
  assert.deepEqual(out.keys, [`nudge:morning:${DAY}`]);
});

test('morning nudge does not fire before its window or after it closes', () => {
  assert.equal(run(at('06:59')).messages.length, 0);
  assert.equal(run(at('07:15')).messages.length, 0);
});

test('a nudge fires once per day', () => {
  const out = run(at('07:05'), { seen: new Set([`nudge:morning:${DAY}`]) });
  assert.equal(out.messages.length, 0);
});

test('morning with nothing to say is marked without a message', () => {
  const out = run(at('07:05'), { lessons: [], values: { wake: 1, gym: 1 } });
  assert.equal(out.messages.length, 0);
  assert.deepEqual(out.keys, [`nudge:morning:${DAY}`]);
});

test('midday lists pending day habits with counter progress', () => {
  const out = run(at('13:00'), { values: { steps: 3200 } });
  assert.equal(out.messages.length, 1);
  assert.match(out.messages[0], /Steps \(3200\/5000 steps\)/);
});

test('night check counts avoided bad habits and asks about unlogged ones', () => {
  const out = run(at('21:30'), { values: { wake: 1, gym: 1, steps: 5000, insta: 0 } });
  const night = out.messages.find((m) => m.includes('Day check'));
  assert.ok(night);
  assert.match(night, /4\/6 done/);
  assert.match(night, /Still open: Reading/);
  assert.match(night, /Log whether you avoided: Blitz Chess/);
});

test('night check congratulates a clean sweep', () => {
  const out = run(at('21:30'), { values: { wake: 1, gym: 1, steps: 5000, read: 1, insta: 0, chess: 0 } });
  assert.match(out.messages.join('\n'), /6\/6 today/);
});

test('doing a bad habit is never a clean sweep', () => {
  const out = run(at('21:30'), { values: { wake: 1, gym: 1, steps: 5000, read: 1, insta: 1, chess: 0 } });
  const night = out.messages.join('\n');
  assert.doesNotMatch(night, /Clean sweep/);
  assert.match(night, /5\/6 done/);
});

test('penalty-only bad habits are cleared by not doing them, never asked to be logged', () => {
  const habits = [habit('wake', 'Wake 6:30', { slot: 'morning' }), habit('junk', 'Junk food', { kind: 'bad', badMode: 'penalty_do' })];
  const clean = run(at('21:30'), { habits, values: { wake: 1 } }).messages.join('\n');
  assert.match(clean, /2\/2 today\.\*\* Clean sweep/);
  const slipped = run(at('21:30'), { habits, values: { wake: 1, junk: 1 } }).messages.join('\n');
  assert.match(slipped, /1\/2 done/);
  assert.doesNotMatch(slipped, /Log whether you avoided/);
});

test('post-class nudge fires 30 min after the last class, dropping Free and merging SIP', () => {
  // Last class ends 16:10, so the window is 16:40 to 16:54.
  assert.equal(run(at('16:39')).messages.length, 0);
  const out = run(at('16:40'));
  assert.equal(out.messages.length, 1);
  assert.match(out.messages[0], /Revise while it's fresh: AIB, QTM, SIP\./);
});

test('study time lists tomorrow, skipping Field Work', () => {
  const out = run(at('20:00'));
  assert.equal(out.messages.length, 1);
  assert.match(out.messages[0], /Tomorrow you have EMDM\./);
});

test('study time with no classes tomorrow still reminds', () => {
  const out = run(at('20:00', 2)); // Tuesday -> Wednesday has nothing
  assert.match(out.messages[0], /No classes tomorrow/);
});

test('toggles switch whole categories off', () => {
  const noHabits = { ...DEFAULT_TELEGRAM_PREFS, habitNudges: false };
  assert.equal(run(at('21:30'), { prefs: noHabits }).messages.length, 0);
  const noStudy = { ...DEFAULT_TELEGRAM_PREFS, studyNudges: false };
  assert.equal(run(at('20:00'), { prefs: noStudy }).messages.length, 0);
});

test('localClock converts UTC to the user zone, including across midnight', () => {
  // 2026-09-19 (Saturday) 20:00 UTC is 01:30 IST on Sunday the 20th.
  const c = localClock('Asia/Kolkata', new Date('2026-09-19T20:00:00Z'));
  assert.deepEqual(c, { dateKey: '2026-09-20', weekday: 0, minutes: 90 });
  // Exactly midnight must be minute 0, not 1440.
  assert.equal(localClock('Asia/Kolkata', new Date('2026-09-19T18:30:00Z')).minutes, 0);
});

test('quiet hours handle windows that cross midnight', () => {
  const p = { sleepTime: '23:30', wakeTime: '07:00' };
  assert.equal(isQuietTime(p, 23 * 60 + 45), true);
  assert.equal(isQuietTime(p, 3 * 60), true);
  assert.equal(isQuietTime(p, 7 * 60), false);
  assert.equal(isQuietTime(p, 12 * 60), false);
});

test('resolvePrefs keeps valid fields and falls back on malformed ones', () => {
  const p = resolvePrefs({ emailAlerts: false, wakeTime: '06:15', nightTime: '25:00', studyTime: 'soon' });
  assert.equal(p.emailAlerts, false);
  assert.equal(p.wakeTime, '06:15');
  assert.equal(p.nightTime, DEFAULT_TELEGRAM_PREFS.nightTime);
  assert.equal(p.studyTime, DEFAULT_TELEGRAM_PREFS.studyTime);
});

test('attendance subjects: real SIP names merge, Free and Field Work drop out', () => {
  assert.equal(attendanceSubject('SiP-I'), 'SIP');
  assert.equal(attendanceSubject('SiP-I MENTOR MEETING'), 'SIP');
  assert.equal(attendanceSubject('Mentor Meeting'), 'SIP');
  assert.equal(attendanceSubject('FIELD WORK'), null);
  assert.equal(attendanceSubject('FREE'), null);
  assert.equal(attendanceSubject('QTM'), 'QTM');
  // "Sip" inside another word must not match.
  assert.equal(attendanceSubject('Gossip Club'), 'Gossip Club');
});

test('offset-less reminder times are read in the user zone, not the server UTC', () => {
  // "remind me at 10:25" from India: 10:25 IST is 04:55 UTC.
  assert.equal(parseInZone('2026-09-21T10:25:00', 'Asia/Kolkata')?.toISOString(), '2026-09-21T04:55:00.000Z');
  assert.equal(parseInZone('2026-09-21 10:25', 'Asia/Kolkata')?.toISOString(), '2026-09-21T04:55:00.000Z');
  // Just after midnight IST is still the previous day in UTC.
  assert.equal(parseInZone('2026-09-22T00:15:00', 'Asia/Kolkata')?.toISOString(), '2026-09-21T18:45:00.000Z');
  // An explicit offset or Z is respected as given.
  assert.equal(parseInZone('2026-09-21T10:25:00Z', 'Asia/Kolkata')?.toISOString(), '2026-09-21T10:25:00.000Z');
  assert.equal(parseInZone('2026-09-21T10:25:00+05:30', 'Asia/Kolkata')?.toISOString(), '2026-09-21T04:55:00.000Z');
  // DST zone: 09:00 in New York in September is EDT (UTC-4).
  assert.equal(parseInZone('2026-09-21T09:00:00', 'America/New_York')?.toISOString(), '2026-09-21T13:00:00.000Z');
  assert.equal(parseInZone('tomorrow at ten', 'Asia/Kolkata'), null);
});

test('reminders reach Telegram even when the app already showed them', () => {
  const now = Date.parse('2026-09-21T05:20:00Z');
  const due = '2026-09-21T04:55:00.000Z'; // 25 min ago
  // Browser popped it up (notified) but Telegram never sent it: send now.
  assert.deepEqual(planReminder({ id: 'a', dueAt: due, notified: true }, now, new Set()), {
    send: true,
    key: `reminder:a:${due}`,
  });
  // Already texted: nothing.
  assert.equal(planReminder({ id: 'a', dueAt: due, notified: true }, now, new Set([`reminder:a:${due}`])), null);
  // Not due yet, or done: nothing.
  assert.equal(planReminder({ id: 'a', dueAt: '2026-09-21T06:00:00Z' }, now, new Set()), null);
  assert.equal(planReminder({ id: 'a', dueAt: due, done: true }, now, new Set()), null);
});

test('old reminders the app already showed are not dumped on Telegram', () => {
  const now = Date.parse('2026-09-21T05:20:00Z');
  const old = '2026-09-19T08:00:00.000Z';
  assert.equal(planReminder({ id: 'b', dueAt: old, notified: true }, now, new Set()), null);
  // Never shown anywhere: still delivered, late, once.
  assert.equal(planReminder({ id: 'b', dueAt: old }, now, new Set())?.send, true);
});

test('a repeating reminder the browser stalled restarts on its own cadence', () => {
  const now = Date.parse('2026-09-21T05:20:00Z');
  // Every 2 hours from 00:00 UTC, fired by the browser at 00:00 and never rescheduled.
  const plan = planReminder({ id: 'w', dueAt: '2026-09-21T00:00:00.000Z', notified: true, repeatMinutes: 120 }, now, new Set());
  assert.equal(plan?.send, false, 'too old to be worth a text');
  assert.equal(plan?.nextDue, '2026-09-21T06:00:00.000Z', 'next slot on the original 2-hour grid');
});

test('a reminder saved with a 1-minute repeat cannot text more than every 15 minutes', () => {
  // The bug that sent three "Drink water" texts every cron pass.
  const now = Date.parse('2026-09-21T05:55:00Z');
  const plan = planReminder({ id: 'd', dueAt: '2026-09-21T05:54:00.000Z', repeatMinutes: 1 }, now, new Set());
  assert.equal(plan?.send, true);
  assert.equal(plan?.nextDue, '2026-09-21T06:09:00.000Z', 'next text 15 min after the last, not 1');
});

/** A document that behaves like Firestore's for create/get/set. */
function fakeDoc(initial?: Record<string, unknown>) {
  let data = initial;
  return {
    create: async (d: Record<string, unknown>) => {
      if (data) throw new Error('ALREADY_EXISTS');
      data = d;
    },
    get: async () => ({ exists: !!data, data: () => data }),
    set: async (d: Record<string, unknown>) => {
      data = d;
    },
  };
}

async function asyncTests() {
  const free = fakeDoc();
  assert.equal(await acquireLock(free), true, 'a free lock is taken');
  assert.equal(await acquireLock(free), false, 'a held lock blocks a second pass');

  const stale = fakeDoc({ at: new Date(Date.now() - 5 * 60_000).toISOString() });
  assert.equal(await acquireLock(stale), true, 'a lock left by a dead pass is taken over');
  passed++;
}

await asyncTests();
console.log(`telegram nudges: ${passed} tests passed`);
