/**
 * Arena — what one player may see of another's board.
 *
 * Privacy in Arena hides a habit's *name*, not the habit. The room still sees
 * the slot, its icon and colour, and whether you cleared it today — so the
 * board stays legible (8 habits, 6 done) while what you're actually working on
 * stays yours. Redaction happens here, at the render boundary.
 */
import type { Habit } from './types';

export const PRIVATE_LABEL = 'Private habit';

/**
 * The habit as `viewerId` is entitled to see it. The owner sees everything;
 * everyone else sees a private habit with its label replaced and its unit
 * dropped (a unit like "cigarettes" would give the label away).
 */
export function forViewer(habit: Habit, viewerId: string): Habit {
  if (!habit.private || habit.playerId === viewerId) return habit;
  return { ...habit, label: PRIVATE_LABEL, unit: undefined };
}

/** Map a whole roster through `forViewer`. */
export function rosterFor(habits: Habit[], viewerId: string): Habit[] {
  return habits.map((h) => forViewer(h, viewerId));
}

/** Is this habit's label redacted for this viewer? Drives the lock icon. */
export function isRedacted(habit: Habit, viewerId: string): boolean {
  return !!habit.private && habit.playerId !== viewerId;
}
