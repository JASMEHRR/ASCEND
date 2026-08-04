import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Radio, Send, Square } from 'lucide-react';
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
      <div className="max-w-[90%] rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-[13px] text-white/90">
        <MessageContent text={shown} />
        {!done && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-brand-400/80" />}
        {done && message.status && message.status.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
            {message.status.map((s, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-mono ${
                  s.kind === 'ok'
                    ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25'
                    : s.kind === 'warn'
                      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25'
                      : 'bg-white/[0.06] text-white/45 ring-1 ring-white/10'
                }`}
              >
                {s.kind === 'ok' ? '✓' : s.kind === 'warn' ? '⚠' : '·'} {s.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The shared Jarvis conversation surface — message stream + composer. Reused by
 * the floating panel and, at full size, by the dashboard. Owns nothing but view
 * state; the engine lives in JarvisProvider.
 */
export default function JarvisConsole({ autoFocus = false }: { autoFocus?: boolean }) {
  const { messages, thinking, sendMessage, abort, voice } = useJarvis();
  const [input, setInput] = useState('');
  const [stopSignal, setStopSignal] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={chatRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1 py-2 space-y-3">
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

      <div className="mt-2 flex items-center gap-2">
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

        {/* Hands-free: the mic re-opens after every reply, so a conversation
            runs without touching anything. Opt-in, and clearly indicated —
            an always-on mic should never be a surprise. */}
        {voice.inputSupported && (
          <button
            type="button"
            onClick={voice.toggleHandsFree}
            role="switch"
            aria-checked={voice.handsFree}
            title={voice.handsFree ? 'Hands-free on — mic reopens after each reply' : 'Hands-free conversation'}
            aria-label={voice.handsFree ? 'Turn off hands-free' : 'Turn on hands-free'}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-all cursor-pointer ${
              voice.handsFree
                ? 'border-brand-400/50 bg-brand-500/20 text-brand-300'
                : 'border-white/10 bg-white/[0.06] text-white/45 hover:bg-white/10 hover:text-white/80'
            }`}
          >
            <Radio size={15} className={voice.handsFree ? 'animate-pulse' : ''} />
          </button>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={voice.listening ? 'Listening…' : 'Ask Jarvis, or give it a command…'}
          aria-label="Message JARVIS"
          className="flex-1 bg-white/[0.06] border border-white/10 rounded-full px-4 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-brand-400/40"
        />
        {busy ? (
          <button onClick={interrupt} className="p-3 rounded-full bg-red-500/25 border border-red-400/40 text-red-300 hover:bg-red-500/35 transition-colors cursor-pointer" aria-label="Stop" title="Stop">
            <Square size={15} className="fill-current" />
          </button>
        ) : (
          <button onClick={submit} disabled={!input.trim()} className="p-3 rounded-full bg-brand-500/25 border border-brand-400/30 text-brand-300 disabled:opacity-30 hover:bg-brand-500/35 transition-colors cursor-pointer" aria-label="Send">
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
