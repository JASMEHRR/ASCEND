import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLaunchState } from './useLaunchState';
import type { LaunchState } from './types';

interface LaunchStateValue {
  state: LaunchState | null;
  update: (fn: (prev: LaunchState) => LaunchState) => void;
}

const LaunchStateContext = createContext<LaunchStateValue | null>(null);

/**
 * Provides the per-user Launch (Strategic Command) state app-wide so both the
 * LaunchHub UI and Jarvis's tools read/write the same synced source.
 */
export function LaunchStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { state, update } = useLaunchState(user?.uid ?? null);
  return <LaunchStateContext.Provider value={{ state, update }}>{children}</LaunchStateContext.Provider>;
}

export function useLaunchStateContext(): LaunchStateValue {
  const ctx = useContext(LaunchStateContext);
  if (!ctx) throw new Error('useLaunchStateContext must be used within a <LaunchStateProvider>');
  return ctx;
}
