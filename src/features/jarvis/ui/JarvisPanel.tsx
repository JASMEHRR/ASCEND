import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles, Volume2, VolumeX, Zap } from 'lucide-react';
import { useJarvis } from '../engine/JarvisProvider';
import JarvisConsole from './JarvisConsole';

/** Floating Jarvis panel (non-dashboard pages). Chrome only — the conversation
 *  is the shared JarvisConsole. Lazy-loaded. */
export default function JarvisPanel() {
  const { voice, setOpen, capabilities } = useJarvis();
  const [showCaps, setShowCaps] = useState(false);
  const modules = [...new Set(capabilities.map((c) => c.module))];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.96 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      role="dialog"
      aria-label="JARVIS command core"
      className="fixed bottom-36 sm:bottom-24 right-4 sm:right-6 z-[91] w-[min(24rem,calc(100vw-2rem))] h-[min(32rem,calc(100vh-12rem))] liquid-glass-panel rounded-[2rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <Sparkles size={14} className="text-brand-400" />
          <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-white/70">jarvis · command core</p>
          {voice.speaking && (
            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="text-[9px] font-mono uppercase tracking-widest text-brand-400">
              speaking
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowCaps((v) => !v)} className={`p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${showCaps ? 'text-brand-400' : 'text-white/60'}`} aria-label="Show capabilities" title="What can Jarvis do?">
            <Zap size={14} />
          </button>
          <button onClick={voice.toggleMuted} className="p-1.5 rounded-full hover:bg-white/10 text-white/60 cursor-pointer" aria-label={voice.muted ? 'Unmute voice' : 'Mute voice'}>
            {voice.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-white/10 text-white/60 cursor-pointer" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {showCaps && (
        <div className="max-h-40 overflow-y-auto custom-scrollbar border-b border-white/10 bg-white/[0.02] px-4 py-3">
          {modules.map((mod) => (
            <div key={mod} className="mb-2 last:mb-0">
              <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-brand-400">{mod}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {capabilities.filter((c) => c.module === mod).map((c) => (
                  <span key={c.name} title={c.description} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 px-4 pb-4 pt-1">
        <JarvisConsole autoFocus fill />
      </div>
    </motion.div>
  );
}
