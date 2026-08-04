/**
 * Arena — tile earning, the miss budget, and the wallet.
 *
 * Replaces habit-arena's points system entirely. There are no per-habit point
 * values and no daily point target: one completed habit earns exactly one
 * tile, so you cannot out-score a friend by stacking high-value habits. You
 * win by actually doing yours.
 *
 * Pure functions only — no React, no Firestore. See tiles.test.ts.
 */
import type { DayKey, Entry, Habit, TilePlacement, TileWallet, WeekKey } from './types';
import { addDays, weekDays, weekKey } from './dates';

/** Misses allowed per week before they start costing tiles. */
export const WEEKLY_MISS_BUDGET = 5;

/**
 * Extra tiles added to the next week's canvas when a habit is removed. Adding
 * a habit is free; removing one makes the following picture larger, so you
 * place more tiles for the same image.
 */
export const REMOVAL_PENALTY_TILES = 3;

/** Is this habit active on this day (started, not expired, not yet removed)? */
export function isHabitActiveOn(habit: Habit, day: DayKey): boolean {
  if (day < habit.startsAt.slice(0, 10)) return false;
  if (habit.expiresAt && day >= habit.expiresAt.slice(0, 10)) return false;
  // Removal only takes effect at week end, so the habit still counts through
  // the week it was removed in.
  if (habit.removedAt) {
    const removalWeek = weekKey(habit.removedAt.slice(0, 10));
    if (weekKey(day) > removalWeek) return false;
  }
  return true;
}

/** Habits active on a given day. */
export function activeHabits(habits: Habit[], day: DayKey): Habit[] {
  return habits.filter((h) => isHabitActiveOn(h, day));
}

/**
 * Did this habit count as done on this day?
 *
 * Counter habits need to hit their target. Bad habits invert: logging one as
 * "done" means you did the bad thing.
 */
export function isDone(habit: Habit, entries: Entry[], day: DayKey): boolean {
  const e = entries.find((x) => x.habitId === habit.id && x.day === day);
  if (!e) return false;
  const target = habit.target && habit.target > 0 ? habit.target : 1;
  return e.value >= target;
}

/**
 * Tiles earned on one day: one per habit that came good.
 *
 * Good habits earn when done. Bad habits in 'reward_avoid' or 'both' earn when
 * explicitly logged as avoided (value 0 with an entry present) — the entry is
 * required, otherwise you'd earn credit for every day you never opened the app.
 */
export function tilesEarnedOn(habits: Habit[], entries: Entry[], day: DayKey): number {
  return activeHabits(habits, day).reduce((n, h) => {
    const entry = entries.find((x) => x.habitId === h.id && x.day === day);
    if (h.kind === 'good') return n + (isDone(h, entries, day) ? 1 : 0);
    // Bad habit: an entry with value 0 means "avoided".
    if (!entry) return n;
    const avoided = entry.value === 0;
    const earns = h.badMode === 'reward_avoid' || h.badMode === 'both';
    return n + (avoided && earns ? 1 : 0);
  }, 0);
}

/**
 * Misses on one day: active habits that didn't come good.
 *
 * Today is never counted — a day still in progress hasn't been missed yet.
 * Bad habits in 'penalty_do' or 'both' count as a miss when actually done.
 */
export function missesOn(habits: Habit[], entries: Entry[], day: DayKey, today: DayKey): number {
  if (day >= today) return 0;
  return activeHabits(habits, day).reduce((n, h) => {
    const entry = entries.find((x) => x.habitId === h.id && x.day === day);
    if (h.kind === 'good') return n + (isDone(h, entries, day) ? 0 : 1);
    const did = !!entry && entry.value > 0;
    const penalised = h.badMode === 'penalty_do' || h.badMode === 'both';
    return n + (did && penalised ? 1 : 0);
  }, 0);
}

export interface WeekMissReport {
  /** Total misses across the week's ended days. */
  misses: number;
  /** Misses still free (WEEKLY_MISS_BUDGET minus used), floored at 0. */
  remaining: number;
  /** Misses beyond the budget — each is a tile that was never earned. */
  overBudget: number;
}

/** How the week's miss budget stands. */
export function weekMisses(
  habits: Habit[],
  entries: Entry[],
  day: DayKey,
  today: DayKey,
): WeekMissReport {
  const misses = weekDays(day).reduce((n, d) => n + missesOn(habits, entries, d, today), 0);
  return {
    misses,
    remaining: Math.max(0, WEEKLY_MISS_BUDGET - misses),
    overBudget: Math.max(0, misses - WEEKLY_MISS_BUDGET),
  };
}

/** Tiles earned across a week. */
export function tilesEarnedInWeek(habits: Habit[], entries: Entry[], day: DayKey): number {
  return weekDays(day).reduce((n, d) => n + tilesEarnedOn(habits, entries, d), 0);
}

/**
 * The wallet: everything earned, everything placed, and what's left to spend.
 *
 * `available` is what makes old weeks repairable — unspent tiles carry forward
 * indefinitely and can land on any unfinished canvas.
 */
export function wallet(
  habits: Habit[],
  entries: Entry[],
  placements: TilePlacement[],
  days: DayKey[],
): TileWallet {
  const earned = days.reduce((n, d) => n + tilesEarnedOn(habits, entries, d), 0);
  const placed = placements.length;
  return { earned, placed, available: Math.max(0, earned - placed) };
}

/**
 * The projected tile count for a week's canvas — how many tiles the picture
 * is cut into.
 *
 * Based on the habits active at week start times seven days, plus the removal
 * penalty carried in from habits retired at the end of the previous week.
 * Habits added mid-week deliberately do NOT enlarge the canvas: the extra
 * tiles they earn become spendable surplus (fill a gap, or repair an old
 * week), which is why adding a habit always helps and never punishes.
 */
export function projectedTiles(habits: Habit[], week: WeekKey, day: DayKey): number {
  const days = weekDays(day);
  const monday = days[0];
  const base = activeHabits(habits, monday).length * 7;
  // Habits removed during the *previous* week enlarge this week's canvas.
  const penalties = habits.filter((h) => {
    if (!h.removedAt) return false;
    const removalWeek = weekKey(h.removedAt.slice(0, 10));
    return removalWeek < week;
  }).length;
  return Math.max(1, base + penalties * REMOVAL_PENALTY_TILES);
}

/**
 * The days a puzzle window covers, given its start and length. Mirrors
 * `weekDays` in shape (a plain array of DayKey) but for an arbitrary window
 * instead of a calendar week — this is what lets a solo puzzle or a room game
 * run on its own clock instead of Monday–Sunday.
 */
export function windowDays(startsAt: DayKey, days: number): DayKey[] {
  return Array.from({ length: Math.max(1, days) }, (_, i) => addDays(startsAt, i));
}

/**
 * The projected tile count for an arbitrary window (a solo puzzle or a room
 * game), sized the same way as `projectedTiles` but off the window's own
 * start day and length instead of the calendar week.
 *
 * Habits active at the window's start day × its length. Habits added after
 * the window opened don't enlarge it — same "surplus, not growth" rule as
 * the weekly canvas — and there's no removal-penalty carry-in here, since a
 * window doesn't have a "previous window" the way calendar weeks do.
 */
export function projectedWindowTiles(habits: Habit[], startsAt: DayKey, days: number): number {
  const base = activeHabits(habits, startsAt).length * Math.max(1, days);
  return Math.max(1, base);
}

/** Tiles earned across an arbitrary window. */
export function tilesEarnedInWindow(habits: Habit[], entries: Entry[], startsAt: DayKey, days: number): number {
  return windowDays(startsAt, days).reduce((n, d) => n + tilesEarnedOn(habits, entries, d), 0);
}

/**
 * Placements against one player's spendable balance for a set of days.
 *
 * On a solo canvas every placement is implicitly the owner's, so `playerId`
 * is omitted and everything in range counts. On a shared room canvas one
 * picture holds tiles from every member, so `playerId` filters to just the
 * ones this player spent — otherwise one active member's placements would
 * look like they'd drained everyone else's balance too.
 */
export function spentThisWeek(placements: TilePlacement[], days: DayKey[], playerId?: string): number {
  return placements.filter((p) => days.includes(p.earnedOn) && (playerId === undefined || p.playerId === playerId)).length;
}

/**
 * Grid dimensions for a tile count, kept as close to the image's aspect ratio
 * as possible so tiles stay roughly square.
 */
export function gridFor(tileCount: number, aspect = 1): { cols: number; rows: number } {
  const cols = Math.max(1, Math.round(Math.sqrt(tileCount * aspect)));
  const rows = Math.max(1, Math.ceil(tileCount / cols));
  return { cols, rows };
}
