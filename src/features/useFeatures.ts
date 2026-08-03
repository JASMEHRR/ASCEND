import { useCallback, useMemo } from 'react';
import type { OSState } from '../types';
import {
  FEATURES,
  isFeatureEnabled,
  type FeatureId,
  type FeatureModule,
} from './registry';

export interface FeaturesApi {
  /** Is this module active for the current user? */
  isEnabled: (id: FeatureId) => boolean;
  /** Flip a module on/off (no-op for core/coming-soon modules). */
  toggle: (id: FeatureId) => void;
  /** Explicitly set a module's enabled state. */
  setEnabled: (id: FeatureId, enabled: boolean) => void;
  /** Active nav modules the user currently sees, in registry order. */
  navModules: FeatureModule[];
  /** Every user-toggleable module (active, non-core) for the settings panel. */
  toggleable: FeatureModule[];
  /** Every enabled nav module in user order, including ones hidden from the rail. */
  navAll: FeatureModule[];
  /** Is this module hidden from the sidebar (but still reachable)? */
  isNavHidden: (id: FeatureId) => boolean;
  /** Show/hide a module in the sidebar without disabling it. */
  toggleNavHidden: (id: FeatureId) => void;
  /** Move a module up or down the sidebar order. */
  moveNav: (id: FeatureId, dir: -1 | 1) => void;
  /** Restore registry order and unhide everything. */
  resetNav: () => void;
}

/** Applies the user's saved order to a module list; unknown ids keep registry order. */
function applyOrder(mods: FeatureModule[], order: string[] | undefined): FeatureModule[] {
  if (!order?.length) return mods;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...mods].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

/**
 * Resolves the feature registry against the user's stored preferences and
 * exposes the toggle actions. All writes route through `updateState`, so the
 * feature config syncs to Firestore exactly like the rest of the OS state.
 */
export function useFeatures(
  state: OSState | null,
  updateState: (updater: (prev: OSState) => OSState) => void,
): FeaturesApi {
  const isEnabled = useCallback((id: FeatureId) => isFeatureEnabled(state, id), [state]);

  const setEnabled = useCallback(
    (id: FeatureId, enabled: boolean) => {
      updateState((prev) => ({
        ...prev,
        features: { ...(prev.features ?? {}), [id]: enabled },
      }));
    },
    [updateState],
  );

  const toggle = useCallback(
    (id: FeatureId) => {
      updateState((prev) => {
        const current = isFeatureEnabled(prev, id);
        return { ...prev, features: { ...(prev.features ?? {}), [id]: !current } };
      });
    },
    [updateState],
  );

  // Every enabled nav module, in the user's chosen order.
  const navAll = useMemo(
    () => applyOrder(FEATURES.filter((f) => f.nav && f.status === 'active' && isFeatureEnabled(state, f.id)), state?.navOrder),
    [state],
  );

  const isNavHidden = useCallback((id: FeatureId) => (state?.navHidden ?? []).includes(id), [state]);

  // What the sidebar actually renders: ordered, minus hidden.
  const navModules = useMemo(() => navAll.filter((f) => !(state?.navHidden ?? []).includes(f.id)), [navAll, state]);

  const toggleNavHidden = useCallback(
    (id: FeatureId) => {
      updateState((prev) => {
        const hidden = prev.navHidden ?? [];
        return { ...prev, navHidden: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] };
      });
    },
    [updateState],
  );

  const moveNav = useCallback(
    (id: FeatureId, dir: -1 | 1) => {
      updateState((prev) => {
        const current = applyOrder(
          FEATURES.filter((f) => f.nav && f.status === 'active' && isFeatureEnabled(prev, f.id)),
          prev.navOrder,
        ).map((f) => f.id);
        const i = current.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= current.length) return prev;
        [current[i], current[j]] = [current[j], current[i]];
        return { ...prev, navOrder: current };
      });
    },
    [updateState],
  );

  const resetNav = useCallback(
    () => updateState((prev) => ({ ...prev, navOrder: [], navHidden: [] })),
    [updateState],
  );

  const toggleable = useMemo(() => FEATURES.filter((f) => !f.core && f.status === 'active'), []);

  return { isEnabled, toggle, setEnabled, navModules, toggleable, navAll, isNavHidden, toggleNavHidden, moveNav, resetNav };
}
