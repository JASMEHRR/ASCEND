import type { OSState } from '../types';

/** The 0–100 daily "discipline ratio" from rituals, workouts, hydration, steps, tasks. */
export function disciplineScore(state: OSState): number {
  let score = 0;
  score += Object.values(state.rituals).filter(Boolean).length * 4;
  score += Object.values(state.exerciseAM).filter(Boolean).length * 5;
  score += Object.values(state.exercisePM).filter(Boolean).length * 5;
  if (state.water >= 3) score += 5;
  if (state.water >= 5) score += 5;
  if (state.steps > 5000) score += 10;
  if (state.steps > 10000) score += 15;
  if (state.primaryObjective?.done) score += 30;
  score += state.tasks.filter((t) => t.done).length * 2;
  return Math.min(100, Math.round(score));
}
