import { useCallback, useMemo } from 'react';
import type { OSState } from '../types';
import { FEATURES, isFeatureEnabled, type FeatureId, type FeatureModule } from './registry';

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

  const navModules = useMemo(
    () => FEATURES.filter((f) => f.nav && f.status === 'active' && isFeatureEnabled(state, f.id)),
    [state],
  );

  const toggleable = useMemo(() => FEATURES.filter((f) => !f.core && f.status === 'active'), []);

  return { isEnabled, toggle, setEnabled, navModules, toggleable };
}
