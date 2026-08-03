import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useJarvis } from '../engine/JarvisProvider';
import JarvisOrb, { useOrbState } from './JarvisOrb';

/** The always-present floating orb that opens Jarvis. Also binds Cmd/Ctrl+J. */
export default function JarvisLauncher() {
  const { open, toggle } = useJarvis();
  const orbState = useOrbState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <motion.button
      onClick={toggle}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      aria-label={open ? 'Close JARVIS' : 'Open JARVIS (Ctrl+J)'}
      className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[90] rounded-full shadow-2xl cursor-pointer"
    >
      <JarvisOrb state={orbState} size={56} />
    </motion.button>
  );
}
