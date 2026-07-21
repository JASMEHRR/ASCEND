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
/** Time-of-day salutation for the proactive login greeting. */
function salutation(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Working late';
}

export default function CoreRegistrar({ state, updateState, view, setView }: Props) {
  const { registerTools, registerContext, memory, greet } = useJarvis();
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

  // Proactive greeting: once per browser session per user, only when enabled.
  // Runs after a short settle so the UI (and speech voices) are ready.
  useEffect(() => {
    if (!user?.uid) return;
    if (stateRef.current.jarvisPrefs?.greetOnLogin === false) return; // opted out — stay idle
    const key = `jarvis_greeted_${user.uid}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    const timer = setTimeout(() => {
      const s = stateRef.current;
      const name = (user.email ?? 'there').split('@')[0];
      const open = s.tasks.filter((t) => !t.done).length;
      const focus = s.primaryObjective && !s.primaryObjective.done ? s.primaryObjective.text : null;
      const bits = [
        focus ? `Today's focus is ${focus}.` : null,
        open > 0 ? `You have ${open} open task${open === 1 ? '' : 's'}.` : 'Your slate is clear.',
      ].filter(Boolean);
      greet(`${salutation()}, ${name}. ${bits.join(' ')} Want a full briefing?`);
    }, 1500);
    return () => clearTimeout(timer);
  }, [user?.uid, user?.email, greet]);

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
