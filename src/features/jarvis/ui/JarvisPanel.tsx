import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Send, Square, X, Sparkles, Volume2, VolumeX, Zap } from 'lucide-react';
import { useJarvis } from '../engine/JarvisProvider';
import type { JarvisMessage } from '../types';
import MessageContent from './MessageContent';
import { useTypewriter } from './useTypewriter';

function Bubble({ message, animate, stopSignal }: { message: JarvisMessage; animate: boolean; stopSignal: number }) {
  const isUser = message.role === 'user';
  const { shown, done, skip } = useTypewriter(message.content, animate && !isUser);

  useEffect(() => {
    if (stopSignal > 0) skip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSignal]);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl border border-brand-400/20 bg-brand-500/20 px-3.5 py-2.5 text-[13px] leading-relaxed text-white whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-[13px] text-white/90">
        <MessageContent text={shown} />
        {!done && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-brand-400/80" />}
      </div>
    </div>
  );
}

/** The Jarvis conversation panel — lazy-loaded; reuses ASCEND's glass + brand. */
export default function JarvisPanel() {
  const { messages, thinking, sendMessage, abort, voice, setOpen, capabilities } = useJarvis();
  const [input, setInput] = useState('');
  const [showCaps, setShowCaps] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const busy = thinking || voice.speaking;

  const submit = () => {
    if (!input.trim() || thinking) return;
    sendMessage(input);
    setInput('');
  };

  const interrupt = () => {
    abort();
    voice.stopSpeaking();
    setStopSignal((s) => s + 1);
  };

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
      {/* header */}
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
          <button
            onClick={() => setShowCaps((v) => !v)}
            className={`p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${showCaps ? 'text-brand-400' : 'text-white/60'}`}
            aria-label="Show capabilities"
            title="What can Jarvis do?"
          >
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

      {/* capabilities drawer */}
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

      {/* messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <Bubble key={i} message={m} animate={i === messages.length - 1 && m.role === 'assistant'} stopSignal={stopSignal} />
        ))}
        {voice.interim && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] italic text-white/50 bg-white/[0.04] border border-white/5">{voice.interim}…</div>
          </div>
        )}
        {thinking && (
          <div className="flex gap-1.5 px-2" aria-label="JARVIS is thinking">
            {[0, 1, 2].map((i) => (
              <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }} className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            ))}
          </div>
        )}
      </div>

      {/* input row */}
      <div className="px-4 pb-4 pt-2 flex items-center gap-2">
        <button
          onClick={() => (voice.listening ? voice.stop() : voice.start())}
          disabled={!voice.inputSupported}
          className={`p-3 rounded-full border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
            voice.listening ? 'bg-red-500/25 border-red-400/40 text-red-300' : 'bg-white/[0.06] border-white/10 text-white/70 hover:bg-white/10'
          }`}
          aria-label={voice.listening ? 'Stop listening' : 'Speak to JARVIS'}
          title={voice.inputSupported ? undefined : 'Voice input needs Chrome or Edge'}
        >
          {voice.listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={voice.listening ? 'Listening…' : 'Ask or command…'}
          aria-label="Message JARVIS"
          className="flex-1 bg-white/[0.06] border border-white/10 rounded-full px-4 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-brand-400/40"
        />
        {busy ? (
          <button
            onClick={interrupt}
            className="p-3 rounded-full bg-red-500/25 border border-red-400/40 text-red-300 hover:bg-red-500/35 transition-colors cursor-pointer"
            aria-label="Stop"
            title="Stop"
          >
            <Square size={15} className="fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!input.trim()}
            className="p-3 rounded-full bg-brand-500/25 border border-brand-400/30 text-brand-300 disabled:opacity-30 hover:bg-brand-500/35 transition-colors cursor-pointer"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
