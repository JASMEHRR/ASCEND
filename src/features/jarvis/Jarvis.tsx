import { Suspense, lazy } from 'react';
import { AnimatePresence } from 'motion/react';
import type { OSState } from '../../types';
import { JarvisProvider, useJarvis } from './JarvisContext';
import JarvisCore, { type View } from './JarvisCore';
import JarvisLauncher from './JarvisLauncher';

// The conversation UI is code-split — its chunk loads only when Jarvis is opened.
const JarvisPanel = lazy(() => import('./JarvisPanel'));

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
 * Jarvis — ASCEND's AI command core. Mount once inside the authenticated app;
 * the floating orb (Ctrl/Cmd+J) opens a voice/text console that orchestrates
 * every module's registered tools with full app-context awareness.
 */
export default function Jarvis(props: Props) {
  return (
    <JarvisProvider>
      <JarvisCore {...props} />
      <JarvisLauncher />
      <PanelHost />
    </JarvisProvider>
  );
}
