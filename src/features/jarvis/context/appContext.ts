import type { OSState } from '../../../types';
import { RITUALS } from '../../../constants';
import type { LaunchState, ProspectStatus } from '../../launch/types';

export type View = 'dashboard' | 'physio' | 'business' | 'vision' | 'buy_list';

export const VIEW_LABELS: Record<View, string> = {
  dashboard: 'Dashboard',
  physio: 'AI Physio',
  business: 'Strategic Command',
  vision: 'Vision Board',
  buy_list: 'Purchases',
};

interface ContextInputs {
  state: OSState;
  launch: LaunchState | null;
  view: View;
  userEmail: string | null;
  disciplineScore: number;
  streak: number;
}

/**
 * The Context Service: assembles everything Jarvis should already know about the
 * user's current situation, so it never asks for information the app already has.
 */
export function buildAppContext({ state, launch, view, userEmail, disciplineScore, streak }: ContextInputs): Record<string, unknown> {
  const ritualsDone = Object.entries(state.rituals)
    .filter(([, v]) => v)
    .map(([id]) => RITUALS.find((r) => r.id === id)?.name ?? id);

  const prospectsByStatus = launch
    ? launch.prospects.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {} as Record<ProspectStatus, number>)
    : null;

  return {
    page: VIEW_LABELS[view],
    user: userEmail,
    today: new Date().toDateString(),
    metrics: {
      disciplineScore,
      streakDays: streak,
      points: state.points ?? 0,
      water: state.water,
      weight: state.weight ?? null,
    },
    rituals: { done: ritualsDone, available: RITUALS.map((r) => r.name) },
    tasks: state.tasks.map((t) => ({ text: t.text, done: t.done })),
    primaryObjective: state.primaryObjective ?? null,
    ideas: state.ideas.map((i) => i.title),
    pain: state.physioState ?? null,
    strategicCommand: launch
      ? {
          activeOffer: launch.activeOffer?.title ?? null,
          pipeline: launch.prospects.length,
          prospectsByStatus,
          planTasksDone: launch.planDone.length,
        }
      : null,
  };
}
