/**
 * Arena date helpers. Pure, timezone-local, no dependencies — so the tests run
 * under plain `node` and the logic is identical on client and server.
 *
 * Ported from habit-arena/src/scoring.js (todayStr, lastNDays) and extended
 * with ISO week keys, which the puzzle needs to group work into canvases.
 */
import type { DayKey, WeekKey } from './types';

/** Today as 'YYYY-MM-DD' in the player's local timezone. */
export function todayStr(d: Date = new Date()): DayKey {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** The last `n` day keys ending at `endStr`, oldest first. */
export function lastNDays(n: number, endStr: DayKey = todayStr()): DayKey[] {
  const out: DayKey[] = [];
  const end = new Date(endStr + 'T00:00:00');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(todayStr(d));
  }
  return out;
}

/** Day key shifted by `delta` days. */
export function addDays(day: DayKey, delta: number): DayKey {
  const d = new Date(day + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return todayStr(d);
}

/**
 * ISO week key, 'YYYY-Www'. ISO weeks start Monday, and the year belongs to
 * the week's Thursday — which is why a January 1st can legitimately land in
 * the previous year's W52/W53. Getting this wrong would silently split a
 * player's week across two canvases at year boundaries.
 */
export function weekKey(day: DayKey = todayStr()): WeekKey {
  const d = new Date(day + 'T00:00:00');
  // Shift to the Thursday of this week: that day's year is the ISO year.
  const dayNum = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dayNum + 3);
  const isoYear = d.getFullYear();
  // Week 1 is the week containing the first Thursday of the ISO year.
  const firstThursday = new Date(isoYear, 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** The seven day keys of the week containing `day`, Monday first. */
export function weekDays(day: DayKey = todayStr()): DayKey[] {
  const d = new Date(day + 'T00:00:00');
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum);
  const monday = todayStr(d);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Monday of the week containing `day`. */
export function weekStart(day: DayKey = todayStr()): DayKey {
  return weekDays(day)[0];
}

/** How many days of this week have fully ended (0–7). Today doesn't count. */
export function daysElapsed(day: DayKey = todayStr()): number {
  return weekDays(day).filter((d) => d < day).length;
}
