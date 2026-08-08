import type { OSState } from '../../../types';
import type { LaunchState, ProspectStatus } from '../../launch/types';
import { FEATURES, isFeatureEnabled } from '../../registry';

export type View = 'dashboard' | 'physio' | 'business' | 'vision' | 'buy_list' | 'stocks' | 'journal' | 'arena' | 'custom';

export const VIEW_LABELS: Record<View, string> = {
  dashboard: 'Dashboard',
  physio: 'AI Physio',
  business: 'Strategic Command',
  vision: 'Vision Board',
  buy_list: 'Purchases',
  stocks: 'Stocks & Finance',
  journal: 'Journal',
  arena: 'Arena',
  custom: 'My Modules',
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

  const prospectsByStatus = launch
    ? launch.prospects.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {} as Record<ProspectStatus, number>)
    : null;

  // Module awareness: Jarvis should help with enabled modules and must not
  // proactively bring up ones this user has turned off (their code still runs
  // for other users, so the disabled set is a per-user visibility fact).
  const enabledFeatures = FEATURES.filter((f) => isFeatureEnabled(state, f.id)).map((f) => f.label);
  const disabledFeatures = FEATURES.filter((f) => f.status === 'active' && !isFeatureEnabled(state, f.id)).map((f) => f.label);

  return {
    page: VIEW_LABELS[view],
    // The name chosen in setup wins over the email — this is what the backend
    // persona addresses the user by, so it's the whole payoff of that step.
    user: state.displayName?.trim() || userEmail,
    today: new Date().toDateString(),
    features: {
      enabled: enabledFeatures,
      disabled: disabledFeatures,
      note: 'Do not proactively surface or suggest disabled modules to this user.',
    },
    metrics: {
      disciplineScore,
      streakDays: streak,
      points: state.points ?? 0,
      water: state.water,
      weight: state.weight ?? null,
    },
    tasks: state.tasks.map((t) => ({ text: t.text, done: t.done })),
    primaryObjective: state.primaryObjective ?? null,
    ideas: state.ideas.map((i) => i.title),
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
