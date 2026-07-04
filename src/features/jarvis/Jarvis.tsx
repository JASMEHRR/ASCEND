import { Suspense, lazy } from 'react';
import { AnimatePresence } from 'motion/react';
import type { OSState } from '../../types';
import { useJarvis } from './engine/JarvisProvider';
import CoreRegistrar from './tools/CoreRegistrar';
import JarvisLauncher from './ui/JarvisLauncher';
import type { View } from './context/appContext';

// The floating panel is code-split — loads only when opened.
const JarvisPanel = lazy(() => import('./ui/JarvisPanel'));

function PanelHost() {
  const { open } = useJarvis();
  return (
    <Suspense fallback={null}>
      <AnimatePresence>{open && <JarvisPanel />}</AnimatePresence>
    </Suspense>
  );
}

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  view: View;
  setView: (v: View) => void;
}

/**
 * Mounts Jarvis into the authenticated app: registers ASCEND's tools/context,
 * and shows the floating orb + panel on every page EXCEPT the dashboard, where
 * Jarvis is the page itself (inline console). The engine lives in JarvisProvider
 * (mounted app-wide in main.tsx) so the dashboard can drive the same conversation.
 */
export default function Jarvis({ state, updateState, view, setView }: Props) {
  const onDashboard = view === 'dashboard';
  return (
    <>
      <CoreRegistrar state={state} updateState={updateState} view={view} setView={setView} />
      {!onDashboard && (
        <>
          <JarvisLauncher />
          <PanelHost />
        </>
      )}
    </>
  );
}
