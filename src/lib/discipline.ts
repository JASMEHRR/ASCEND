import type { OSState } from '../types';

/** The 0–100 daily "discipline ratio" from rituals, hydration, focus, and tasks. */
export function disciplineScore(state: OSState): number {
  let score = 0;
  score += Object.values(state.rituals).filter(Boolean).length * 5;
  if (state.water >= 3) score += 5;
  if (state.water >= 5) score += 5;
  if (state.primaryObjective?.done) score += 30;
  score += state.tasks.filter((t) => t.done).length * 3;
  return Math.min(100, Math.round(score));
}
