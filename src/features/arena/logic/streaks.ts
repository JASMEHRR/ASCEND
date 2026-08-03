/**
 * Arena — streaks.
 *
 * Three kinds, deliberately: personal daily, personal weekly (pictures
 * finished back to back), and the room streak — consecutive days where every
 * player cleared. The room streak is the one that matters socially: it makes
 * your miss cost your friends something concrete, which is the whole premise
 * of a shared board.
 */
import type { DayKey, Entry, Habit } from './types';
import { addDays } from './dates';
import { activeHabits, isDone } from './tiles';

/** Did this player clear every active habit on this day? */
export function clearedDay(habits: Habit[], entries: Entry[], day: DayKey): boolean {
  const active = activeHabits(habits, day);
  if (active.length === 0) return false;
  return active.every((h) => {
    if (h.kind === 'good') return isDone(h, entries, day);
    const e = entries.find((x) => x.habitId === h.id && x.day === day);
    return !!e && e.value === 0; // logged as avoided
  });
}

/**
 * Consecutive cleared days ending today.
 *
 * Today counts if already cleared but never breaks the streak while it's still
 * in progress — a streak shouldn't die at 00:01 because you haven't ticked
 * anything yet.
 */
export function dailyStreak(habits: Habit[], entries: Entry[], today: DayKey): number {
  let n = 0;
  let day = clearedDay(habits, entries, today) ? today : addDays(today, -1);
  while (clearedDay(habits, entries, day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/**
 * Consecutive days where *every* player in the room cleared.
 * `byPlayer` maps player id to that player's habits and entries.
 */
export function roomStreak(
  byPlayer: { habits: Habit[]; entries: Entry[] }[],
  today: DayKey,
): number {
  if (byPlayer.length === 0) return 0;
  const allCleared = (day: DayKey) => byPlayer.every((p) => clearedDay(p.habits, p.entries, day));
  let n = 0;
  let day = allCleared(today) ? today : addDays(today, -1);
  while (allCleared(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/**
 * Consecutive finished pictures ending with the most recent completed week.
 * `completedWeeks` is the set of week keys whose canvas was filled.
 */
export function weeklyStreak(completedWeeks: Set<string>, weeksDescending: string[]): number {
  let n = 0;
  for (const w of weeksDescending) {
    if (!completedWeeks.has(w)) break;
    n++;
  }
  return n;
}
