import { useEffect } from 'react';
import type { OSState } from '../types';
import { todayStr, yesterdayStr } from '../lib/date';

/**
 * Credits a daily activity streak once per day, the first time the user shows
 * any progress. Continues if yesterday was credited, otherwise restarts at 1.
 */
export function useStreak(
  state: OSState | null,
  updateState: (updater: (prev: OSState) => OSState) => void,
  activeToday: boolean,
) {
  useEffect(() => {
    if (!state || !activeToday) return;
    const today = todayStr();
    if (state.streakDate === today) return; // already credited today
    updateState((prev) => {
      const next = prev.streakDate === yesterdayStr() ? (prev.streak ?? 0) + 1 : 1;
      return { ...prev, streak: next, streakDate: today };
    });
  }, [state, activeToday, updateState]);
}

/** The streak that's still "alive" (credited today or yesterday), else 0. */
export function effectiveStreak(state: OSState): number {
  if (!state.streakDate) return 0;
  return state.streakDate === todayStr() || state.streakDate === yesterdayStr() ? state.streak ?? 0 : 0;
}
