/**
 * Arena logic tests. Dependency-free so they run under plain `node` after a
 * tsc pass, exactly like habit-arena's originals:
 *
 *   npx tsx src/features/arena/logic/arena.test.ts
 */
import assert from 'node:assert/strict';
import { addDays, daysElapsed, todayStr, weekDays, weekKey, weekStart } from './dates';
import {
  WEEKLY_MISS_BUDGET,
  activeHabits,
  gridFor,
  isDone,
  isHabitActiveOn,
  missesOn,
  projectedTiles,
  tilesEarnedInWeek,
  tilesEarnedOn,
  wallet,
  weekMisses,
} from './tiles';
import { halfFor, isComplete, nextSlot, placeTile, progress, revealOrder } from './reveal';
import { clearedDay, dailyStreak, roomStreak, weeklyStreak } from './streaks';
import type { Entry, Habit, TilePlacement } from './types';

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

// --- helpers -------------------------------------------------------------

function habit(id: string, over: Partial<Habit> = {}): Habit {
  return {
    id,
    playerId: 'p1',
    label: id,
    kind: 'good',
    icon: 'check',
    color: '#fff',
    startsAt: '2020-01-01T00:00:00.000Z',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

function entry(habitId: string, day: string, value = 1): Entry {
  return { id: `${habitId}-${day}`, habitId, playerId: 'p1', day, value, at: `${day}T12:00:00Z` };
}

// --- dates ---------------------------------------------------------------

test('todayStr is local-timezone YYYY-MM-DD', () => {
  assert.match(todayStr(new Date('2026-08-03T15:00:00')), /^\d{4}-\d{2}-\d{2}$/);
});

test('addDays crosses month boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('weekDays returns Monday-first seven days', () => {
  const days = weekDays('2026-08-05'); // a Wednesday
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-08-03'); // Monday
  assert.equal(days[6], '2026-08-09'); // Sunday
  assert.equal(weekStart('2026-08-05'), '2026-08-03');
});

test('weekKey uses ISO weeks, and the year follows the Thursday', () => {
  // 2026-01-01 is a Thursday, so it belongs to 2026-W01.
  assert.equal(weekKey('2026-01-01'), '2026-W01');
  // 2027-01-01 is a Friday; that week's Thursday is 2026-12-31 → 2026-W53.
  assert.equal(weekKey('2027-01-01'), '2026-W53');
  // Same week, same key regardless of which day you ask about.
  assert.equal(weekKey('2026-08-03'), weekKey('2026-08-09'));
  assert.notEqual(weekKey('2026-08-09'), weekKey('2026-08-10'));
});

test('daysElapsed excludes today', () => {
  assert.equal(daysElapsed('2026-08-03'), 0); // Monday
  assert.equal(daysElapsed('2026-08-06'), 3); // Thursday: Mon-Wed ended
});

// --- habit activity ------------------------------------------------------

test('habits are inactive before they start and after they expire', () => {
  const h = habit('h', { startsAt: '2026-08-05T00:00:00Z', expiresAt: '2026-08-08T00:00:00Z' });
  assert.equal(isHabitActiveOn(h, '2026-08-04'), false);
  assert.equal(isHabitActiveOn(h, '2026-08-05'), true);
  assert.equal(isHabitActiveOn(h, '2026-08-07'), true);
  assert.equal(isHabitActiveOn(h, '2026-08-08'), false);
});

test('a removed habit still counts through its own week, then stops', () => {
  const h = habit('h', { removedAt: '2026-08-05T00:00:00Z' }); // Wed of 2026-W32
  assert.equal(isHabitActiveOn(h, '2026-08-07'), true); // same week
  assert.equal(isHabitActiveOn(h, '2026-08-10'), false); // next week
});

test('activeHabits filters the list', () => {
  const hs = [habit('a'), habit('b', { expiresAt: '2026-08-01T00:00:00Z' })];
  assert.deepEqual(activeHabits(hs, '2026-08-05').map((h) => h.id), ['a']);
});

// --- earning -------------------------------------------------------------

test('counter habits need their target to count as done', () => {
  const h = habit('water', { target: 8 });
  assert.equal(isDone(h, [entry('water', '2026-08-05', 5)], '2026-08-05'), false);
  assert.equal(isDone(h, [entry('water', '2026-08-05', 8)], '2026-08-05'), true);
});

test('one habit completion earns exactly one tile', () => {
  const hs = [habit('a'), habit('b'), habit('c')];
  const es = [entry('a', '2026-08-05'), entry('b', '2026-08-05')];
  assert.equal(tilesEarnedOn(hs, es, '2026-08-05'), 2);
});

test('bad habits earn only when explicitly logged avoided', () => {
  const h = habit('scroll', { kind: 'bad', badMode: 'reward_avoid' });
  // No entry at all: no credit for silence.
  assert.equal(tilesEarnedOn([h], [], '2026-08-05'), 0);
  // Logged avoided (value 0): earns.
  assert.equal(tilesEarnedOn([h], [entry('scroll', '2026-08-05', 0)], '2026-08-05'), 1);
  // Logged as done: no tile.
  assert.equal(tilesEarnedOn([h], [entry('scroll', '2026-08-05', 1)], '2026-08-05'), 0);
});

test('private habits earn tiles and clear days exactly like public ones', () => {
  // Privacy is a visibility flag only: it must never change the arithmetic,
  // or hiding a habit would quietly alter your standing in the room.
  const hs = [habit('a'), habit('secret', { private: true })];
  const es = [entry('a', '2026-08-05'), entry('secret', '2026-08-05')];
  assert.equal(tilesEarnedOn(hs, es, '2026-08-05'), 2);
  assert.equal(clearedDay(hs, es, '2026-08-05'), true);
  // And a missed private habit still breaks the day, so the room streak is honest.
  assert.equal(clearedDay(hs, [entry('a', '2026-08-05')], '2026-08-05'), false);
});

// --- misses --------------------------------------------------------------

test('today is never a miss', () => {
  const hs = [habit('a')];
  assert.equal(missesOn(hs, [], '2026-08-05', '2026-08-05'), 0);
  assert.equal(missesOn(hs, [], '2026-08-04', '2026-08-05'), 1);
});

test('penalty_do bad habits count as a miss when actually done', () => {
  const h = habit('smoke', { kind: 'bad', badMode: 'penalty_do' });
  const today = '2026-08-06';
  assert.equal(missesOn([h], [entry('smoke', '2026-08-05', 1)], '2026-08-05', today), 1);
  assert.equal(missesOn([h], [entry('smoke', '2026-08-05', 0)], '2026-08-05', today), 0);
});

test('the weekly miss budget is 5, and overage is reported separately', () => {
  const hs = [habit('a')];
  const today = '2026-08-10'; // Monday after the 2026-W32 week ended
  // Nothing logged all week: 7 ended days = 7 misses.
  const r = weekMisses(hs, [], '2026-08-05', today);
  assert.equal(r.misses, 7);
  assert.equal(r.remaining, 0);
  assert.equal(r.overBudget, 7 - WEEKLY_MISS_BUDGET);
});

test('misses within budget leave remaining and no overage', () => {
  const hs = [habit('a')];
  const days = weekDays('2026-08-05');
  // Clear every day except two.
  const es = days.slice(0, 5).map((d) => entry('a', d));
  const r = weekMisses(hs, es, '2026-08-05', '2026-08-10');
  assert.equal(r.misses, 2);
  assert.equal(r.remaining, 3);
  assert.equal(r.overBudget, 0);
});

// --- wallet --------------------------------------------------------------

test('the wallet carries unspent tiles forward', () => {
  const hs = [habit('a')];
  const days = ['2026-08-03', '2026-08-04', '2026-08-05'];
  const es = days.map((d) => entry('a', d));
  const placements: TilePlacement[] = [
    { index: 0, week: '2026-W32', earnedOn: '2026-08-03', repair: false, at: '' },
  ];
  const w = wallet(hs, es, placements, days);
  assert.equal(w.earned, 3);
  assert.equal(w.placed, 1);
  assert.equal(w.available, 2); // spendable on this week or an old one
});

test('tilesEarnedInWeek sums the week', () => {
  const hs = [habit('a')];
  const es = weekDays('2026-08-05').map((d) => entry('a', d));
  assert.equal(tilesEarnedInWeek(hs, es, '2026-08-05'), 7);
});

// --- canvas sizing -------------------------------------------------------

test('projected tiles = habits at week start x 7', () => {
  const hs = [habit('a'), habit('b')];
  assert.equal(projectedTiles(hs, '2026-W32', '2026-08-05'), 14);
});

test('habits added mid-week do NOT enlarge the canvas', () => {
  const hs = [habit('a'), habit('b', { startsAt: '2026-08-06T00:00:00Z' })];
  // Only 'a' is active on Monday, so the canvas stays at 7 — the tiles 'b'
  // earns become spendable surplus instead.
  assert.equal(projectedTiles(hs, '2026-W32', '2026-08-05'), 7);
});

test('removing a habit enlarges the FOLLOWING week', () => {
  const hs = [habit('a'), habit('b', { removedAt: '2026-08-05T00:00:00Z' })];
  // Same week as the removal: unchanged.
  assert.equal(projectedTiles(hs, '2026-W32', '2026-08-05'), 14);
  // Next week: 'b' is gone (7 fewer) but the penalty adds 3.
  assert.equal(projectedTiles(hs, '2026-W33', '2026-08-12'), 7 + 3);
});

test('gridFor keeps tiles roughly square', () => {
  const g = gridFor(35, 1);
  assert.ok(g.cols * g.rows >= 35);
  const wide = gridFor(24, 16 / 9);
  assert.ok(wide.cols > wide.rows);
});

// --- reveal --------------------------------------------------------------

test('reveal starts at the centre and works outward', () => {
  const order = revealOrder(3, 3);
  assert.equal(order[0], 4); // dead centre of a 3x3
  assert.equal(order.length, 9);
  assert.equal(new Set(order).size, 9); // every cell exactly once
  // Corners are furthest, so they come last.
  const corners = new Set([0, 2, 6, 8]);
  assert.ok(order.slice(-4).every((i) => corners.has(i)));
});

test('nextSlot skips filled cells and returns null when complete', () => {
  const placements: TilePlacement[] = [
    { index: 4, week: 'w', earnedOn: 'd', repair: false, at: '' },
  ];
  assert.notEqual(nextSlot(3, 3, placements), 4);
  const full = revealOrder(2, 2).map((index) => ({ index, week: 'w', earnedOn: 'd', repair: false, at: '' }));
  assert.equal(nextSlot(2, 2, full), null);
  assert.equal(isComplete(2, 2, full), true);
});

test('a tile earned in another week is flagged as a repair', () => {
  const canvas = { week: '2026-W32', cols: 2, rows: 2, placements: [] as TilePlacement[] };
  const same = placeTile(canvas, '2026-08-05');
  assert.equal(same?.repair, false);
  const later = placeTile(canvas, '2026-08-12'); // W33 tile on a W32 canvas
  assert.equal(later?.repair, true);
});

test('progress is a 0-1 fraction', () => {
  assert.equal(progress(2, 2, []), 0);
  const two: TilePlacement[] = [0, 1].map((index) => ({ index, week: 'w', earnedOn: 'd', repair: false, at: '' }));
  assert.equal(progress(2, 2, two), 0.5);
});

test('a shared canvas splits into two halves that do not overlap', () => {
  const owner = halfFor('owner', 4, 2);
  const guest = halfFor('guest', 4, 2);
  assert.equal(owner.length, 4);
  assert.equal(guest.length, 4);
  assert.equal(owner.filter((i) => guest.includes(i)).length, 0);
});

test('a canvas fills centre-out and finishes exactly once', () => {
  // Walk a whole 3x3 canvas the way the UI does, one placement at a time.
  const canvas = { week: '2026-W32', cols: 3, rows: 3, placements: [] as TilePlacement[] };
  const seen: number[] = [];
  for (let i = 0; i < 9; i++) {
    const t = placeTile(canvas, '2026-08-05');
    assert.ok(t, `placement ${i} should succeed`);
    canvas.placements.push(t!);
    seen.push(t!.index);
  }
  assert.equal(new Set(seen).size, 9); // no cell filled twice
  assert.equal(seen[0], 4); // started dead centre
  assert.equal(isComplete(3, 3, canvas.placements), true);
  assert.equal(placeTile(canvas, '2026-08-05'), null); // no tenth tile
});

test('repairing an old week marks only the repaired tiles', () => {
  const old = { week: '2026-W30', cols: 2, rows: 2, placements: [] as TilePlacement[] };
  // Two tiles earned during that week.
  for (let i = 0; i < 2; i++) old.placements.push(placeTile(old, '2026-07-22')!);
  // Two more earned weeks later, rescuing it.
  for (let i = 0; i < 2; i++) old.placements.push(placeTile(old, '2026-08-05')!);
  assert.equal(isComplete(2, 2, old.placements), true);
  assert.deepEqual(old.placements.map((p) => p.repair), [false, false, true, true]);
});

// --- streaks -------------------------------------------------------------

test('a day is cleared only when every active habit came good', () => {
  const hs = [habit('a'), habit('b')];
  assert.equal(clearedDay(hs, [entry('a', '2026-08-05')], '2026-08-05'), false);
  assert.equal(clearedDay(hs, [entry('a', '2026-08-05'), entry('b', '2026-08-05')], '2026-08-05'), true);
});

test('an in-progress today does not break the daily streak', () => {
  const hs = [habit('a')];
  const es = [entry('a', '2026-08-03'), entry('a', '2026-08-04')];
  // Today (the 5th) has nothing logged yet, but the streak survives.
  assert.equal(dailyStreak(hs, es, '2026-08-05'), 2);
});

test('the room streak needs every player to clear', () => {
  const hs = [habit('a')];
  const p1 = { habits: hs, entries: [entry('a', '2026-08-04')] };
  const p2 = { habits: hs, entries: [entry('a', '2026-08-04')] };
  assert.equal(roomStreak([p1, p2], '2026-08-05'), 1);
  const slacker = { habits: hs, entries: [] as Entry[] };
  assert.equal(roomStreak([p1, slacker], '2026-08-05'), 0);
});

test('weeklyStreak counts back-to-back finished pictures', () => {
  const done = new Set(['2026-W32', '2026-W31']);
  assert.equal(weeklyStreak(done, ['2026-W32', '2026-W31', '2026-W30']), 2);
});

console.log(`arena logic: ${passed} tests passed`);
