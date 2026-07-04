import { useEffect, useRef } from 'react';
import type { OSState } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useLaunchStateContext } from '../../launch/LaunchStateContext';
import { disciplineScore } from '../../../lib/discipline';
import { effectiveStreak } from '../../../hooks/useStreak';
import { useJarvis } from '../engine/JarvisProvider';
import { buildAppContext, type View } from '../context/appContext';
import { createAppTools } from './appTools';
import { createLaunchTools } from './launchTools';
import { createMemoryTools } from './memoryTools';
import type { LaunchState } from '../../launch/types';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  view: View;
  setView: (v: View) => void;
}

/**
 * Registers ASCEND's tools + live context with the Jarvis engine. Renders
 * nothing. New modules add their own registrar the same way — the engine and
 * every other module stay untouched.
 */
export default function CoreRegistrar({ state, updateState, view, setView }: Props) {
  const { registerTools, registerContext, memory } = useJarvis();
  const { user } = useAuth();
  const { state: launch, update: updateLaunch } = useLaunchStateContext();

  // Refs so registered closures read fresh data without re-registering.
  const stateRef = useRef<OSState>(state);
  stateRef.current = state;
  const launchRef = useRef<LaunchState | null>(launch);
  launchRef.current = launch;
  const viewRef = useRef<View>(view);
  viewRef.current = view;
  const userEmailRef = useRef<string | null>(user?.email ?? null);
  userEmailRef.current = user?.email ?? null;

  useEffect(() => {
    return registerTools('core', [
      ...createAppTools({ stateRef, updateState, setView }),
      ...createLaunchTools({ launchRef, updateLaunch }),
      ...createMemoryTools({ remember: memory.remember, forget: memory.forget }),
    ]);
  }, [registerTools, updateState, updateLaunch, setView, memory.remember, memory.forget]);

  useEffect(() => {
    return registerContext('core', () =>
      buildAppContext({
        state: stateRef.current,
        launch: launchRef.current,
        view: viewRef.current,
        userEmail: userEmailRef.current,
        disciplineScore: disciplineScore(stateRef.current),
        streak: effectiveStreak(stateRef.current),
      }),
    );
  }, [registerContext]);

  return null;
}
