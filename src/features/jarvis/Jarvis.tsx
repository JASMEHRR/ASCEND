import { Suspense, lazy } from 'react';
import { AnimatePresence } from 'motion/react';
import type { OSState } from '../../types';
import { JarvisProvider, useJarvis } from './engine/JarvisProvider';
import CoreRegistrar from './tools/CoreRegistrar';
import JarvisLauncher from './ui/JarvisLauncher';
import type { View } from './context/appContext';

// The conversation UI (+ markdown renderer) is code-split — loads on first open.
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
 * Jarvis — ASCEND's AI command core. Mount once inside the authenticated app.
 * The engine (registry + memory + conversation + voice) lives in JarvisProvider;
 * CoreRegistrar wires ASCEND's tools + context; the panel is lazy-loaded.
 */
export default function Jarvis(props: Props) {
  return (
    <JarvisProvider>
      <CoreRegistrar {...props} />
      <JarvisLauncher />
      <PanelHost />
    </JarvisProvider>
  );
}
