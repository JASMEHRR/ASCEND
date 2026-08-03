import type { OSState } from '../types';

/**
 * The 0–100 daily discipline ratio.
 *
 * Habits come from Arena now rather than the old fixed ritual list, so the
 * score and the leaderboard finally read from the same source — there is one
 * definition of "did I show up today". Arena's contribution is passed in
 * because it lives in Firestore under the user, not in OSState.
 *
 * Habits are weighted as a proportion (up to 60) rather than a flat points-
 * per-habit, so someone keeping twelve habits isn't scored more harshly than
 * someone keeping four. The rest is hydration, the day's focus, and tasks.
 */
export function disciplineScore(state: OSState, arena?: { done: number; total: number }): number {
  let score = 0;
  if (arena && arena.total > 0) score += (arena.done / arena.total) * 60;
  if (state.water >= 3) score += 5;
  if (state.water >= 5) score += 5;
  if (state.primaryObjective?.done) score += 20;
  score += state.tasks.filter((t) => t.done).length * 3;
  return Math.min(100, Math.round(score));
}
