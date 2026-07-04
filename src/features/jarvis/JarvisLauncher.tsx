import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useJarvis } from './JarvisContext';

/** The always-present floating orb that opens Jarvis. Also binds Cmd/Ctrl+J. */
export default function JarvisLauncher() {
  const { open, toggle, thinking, voice } = useJarvis();

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
      className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[90] h-14 w-14 rounded-full liquid-glass-panel border border-white/15 shadow-2xl flex items-center justify-center backdrop-blur-xl cursor-pointer"
    >
      <motion.div
        animate={
          voice.listening
            ? { scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }
            : thinking
              ? { rotate: 360 }
              : { scale: [1, 1.06, 1] }
        }
        transition={
          thinking
            ? { repeat: Infinity, duration: 1.2, ease: 'linear' }
            : { repeat: Infinity, duration: voice.listening ? 0.9 : 3 }
        }
        className="text-brand-400"
      >
        <Sparkles size={22} />
      </motion.div>
      {voice.listening && <span className="absolute inset-0 rounded-full animate-ping bg-brand-400/20" />}
    </motion.button>
  );
}
