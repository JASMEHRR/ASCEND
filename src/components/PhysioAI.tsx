import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, Activity, MountainSnow, ChevronUp, User, Bot, Sparkles, Footprints, ArrowRight } from 'lucide-react';
import type { OSState } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

export default function PhysioAI({ state, updateState }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey! I'm Alex, your personal physiotherapist. I know about your lumbar disc, posture, tailbone, knock knees, and right foot. I also know about your June 10 trek.\n\nUse the sliders below to log your pain levels, then tell me how you're feeling or tap a condition to get started.",
    }
  ]);
  const [inputStr, setInputStr] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const painState = state.physioState || {
    back: 3,
    tailbone: 2,
    knees: 2,
    foot: 4,
    neck: 2
  };

  const updatePain = (key: keyof typeof painState, value: number) => {
    updateState(prev => ({
      ...prev,
      physioState: {
        ...(prev.physioState || painState),
        [key]: value
      }
    }));
  };

  const scrollToBottom = () => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const getPainColor = (val: number) => {
    if (val <= 3) return 'text-brand-500';
    if (val <= 6) return 'text-amber-500';
    return 'text-red-500';
  };

  const getPainSummary = () => {
    return `[Current pain levels logged by user - Lower back: ${painState.back}/10, Tailbone: ${painState.tailbone}/10, Knees: ${painState.knees}/10, Right foot: ${painState.foot}/10, Neck/posture: ${painState.neck}/10]`;
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Build standard history context without repeating pain summary in UI
    const newUserMsg: Message = { role: 'user', content: text };
    
    // We append the prompt to the backend request history, but to show in UI we don't want the raw tag
    const historyForBackend = [
      ...messages,
      { role: 'user', content: `${getPainSummary()}\n\nUser message: ${text}` }
    ];

    setMessages(prev => [...prev, newUserMsg]);
    setInputStr('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/physio-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyForBackend })
      });
      const data = await res.json();
      
      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Connection issue: ${data.error || 'Server error'}. Please try again.` }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Request failed: ${e.message || 'Network error'}. Please try again.` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const quickSend = (txt: string) => {
    sendMessage(txt);
  };

  return (
    <div className="w-full h-full flex flex-col gap-6 overflow-y-auto px-1 pb-10">
      
      {/* Header Area */}
      <div className="liquid-glass-panel rounded-3xl p-6 flex flex-col sm:flex-row gap-6 relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 p-8 rounded-bl-full bg-brand-500/5 backdrop-blur-3xl" />
        <div className="w-16 h-16 rounded-full bg-brand-500 flex flex-col items-center justify-center shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          <Activity size={26} className="text-[#0c0e14] mb-0.5" />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Alex <span className="text-white/40 text-lg font-light">&mdash; AI Physiotherapist</span>
          </h2>
          <p className="text-sm font-medium text-brand-400/80 mt-1">Specialising in spinal rehab, posture, and mobility</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 flex flex-col gap-6">

          {/* Trek Banner */}
          <div className="bg-brand-500/10 border border-brand-500/30 rounded-3xl p-5 flex items-start gap-4 shadow-inner">
            <div className="p-2 rounded-full bg-brand-500/20 text-brand-400 mt-0.5">
              <MountainSnow size={18} />
            </div>
            <div>
              <p className="text-[13px] font-bold text-brand-400 uppercase tracking-widest mb-1 font-mono">Trek on June 10</p>
              <p className="text-sm text-white/80 leading-relaxed font-medium">10 km (up to ~20 km). Goal: stay fresh, avoid flare-ups, move smart.</p>
            </div>
          </div>

          {/* Conditions Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '🫀', lbl: 'Lower back', val: 'Disc bulge', msg: 'Tell me exercises for my lumbar disc bulge' },
              { icon: '🧍', lbl: 'Alignment', val: 'Poor posture', msg: 'Help me fix my posture' },
              { icon: '🦴', lbl: 'Sitting pain', val: 'Tailbone pain', msg: 'My tailbone hurts. What can I do?' },
              { icon: '🦵', lbl: 'Alignment', val: 'Knock knees', msg: 'Give me exercises for my knock knees' },
              { icon: '🦶', lbl: 'Chronic pain', val: 'Right foot pain', msg: 'My right foot is hurting. What should I do?' }
            ].map((c, i) => (
              <button 
                key={i} 
                onClick={() => quickSend(c.msg)}
                className="flex flex-col gap-1 items-start justify-center p-3.5 bg-white/[0.03] hover:bg-white/[0.08] active:scale-95 border border-white/5 hover:border-white/15 rounded-2xl transition-all text-left group"
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-lg grayscale group-hover:grayscale-0 transition-all">{c.icon}</span>
                  <ArrowRight size={12} className="text-white/20 group-hover:text-white/60 transition-opacity" />
                </div>
                <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold font-mono">{c.lbl}</span>
                <span className="text-xs font-semibold text-white/90">{c.val}</span>
              </button>
            ))}
          </div>

          {/* Pain Check-in */}
          <div className="liquid-glass-panel rounded-3xl p-5 border border-white/5">
            <h3 className="text-[11px] font-mono font-bold text-white/50 uppercase tracking-[0.2em] mb-4">Today's Pain Matrix (0-10)</h3>
            <div className="space-y-4">
              {[
                { k: 'back', lbl: 'Lower back' },
                { k: 'tailbone', lbl: 'Tailbone' },
                { k: 'knees', lbl: 'Knees' },
                { k: 'foot', lbl: 'Right foot' },
                { k: 'neck', lbl: 'Neck / posture' }
              ].map(p => (
                <div key={p.k} className="flex items-center gap-4 group">
                  <label className="text-xs font-semibold text-white/70 w-24 shrink-0 transition-colors group-hover:text-white/90">{p.lbl}</label>
                  <input 
                    type="range" min="0" max="10" step="1" 
                    value={(painState as any)[p.k]}
                    onChange={(e) => updatePain(p.k as any, parseInt(e.target.value))}
                    className="flex-1 accent-brand-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                  />
                  <span className={`text-sm font-bold w-6 text-right ${getPainColor((painState as any)[p.k])}`}>
                    {(painState as any)[p.k]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="lg:col-span-8 flex flex-col h-[600px] lg:h-[720px] bg-white/[0.02] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5 custom-scrollbar" ref={chatRef}>
            {messages.map((m, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex gap-3 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${m.role === 'user' ? 'bg-white/10 text-white/50' : 'bg-brand-500 text-[#0c0e14]'}`}>
                  {m.role === 'user' ? <User size={14} /> : <Bot size={16} />}
                </div>
                <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm
                  ${m.role === 'user' 
                    ? 'bg-brand-500 text-[#0c0e14] font-medium rounded-tr-sm' 
                    : 'bg-[#18181b]/90 border border-white/5 text-white/90 rounded-tl-sm backdrop-blur-md'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    // Very simple formatting of AI responses
                    <div dangerouslySetInnerHTML={{ 
                      __html: m.content
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n\n/g, '<br/><br/>')
                        .replace(/\n- /g, '<br/>• ') 
                    }} />
                  ) : m.content}
                </div>
              </motion.div>
            ))}
            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 mr-auto items-end">
                <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-[#0c0e14]">
                   <Bot size={16} />
                </div>
                <div className="px-5 py-3.5 bg-[#18181b]/90 border border-white/5 rounded-2xl rounded-tl-sm flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </div>

          <div className="p-4 bg-gradient-to-t from-[#0c0e14] via-[#0c0e14]/90 to-transparent pt-8 shrink-0 border-t border-white/5 relative z-10">
            <div className="flex flex-wrap gap-2 mb-4 px-1">
              {[
                { lbl: 'Start session', txt: 'Let\'s start a physiotherapy session' },
                { lbl: 'Trek prep plan', txt: 'Give me a trek prep plan for June 10' },
                { lbl: 'Safe exercises', txt: 'What exercises should I avoid with a disc bulge?' },
                { lbl: 'Backpack tips', txt: 'How should I pack my backpack to protect my back?' },
                { lbl: 'Morning routine', txt: 'Give me a morning mobility routine' }
              ].map(q => (
                <button 
                  key={q.lbl}
                  onClick={() => quickSend(q.txt)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 rounded-full text-[11px] text-white/70 hover:text-white transition-colors cursor-pointer flex items-center gap-1 font-medium font-sans"
                >
                  {q.lbl} <ChevronUp size={10} className="text-white/30" />
                </button>
              ))}
            </div>

            <div className="relative flex items-center">
              <input 
                type="text" 
                value={inputStr}
                onChange={e => setInputStr(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage(inputStr)}
                placeholder="Describe your symptoms or ask Alex anything..."
                className="w-full bg-[#18181b] border border-white/10 rounded-2xl pl-5 pr-14 py-4 text-sm text-white placeholder-white/30 outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 shadow-inner"
              />
              <button 
                onClick={() => sendMessage(inputStr)}
                disabled={!inputStr.trim() || isTyping}
                className="absolute right-2 p-2.5 bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:opacity-50 disabled:active:scale-100 rounded-xl text-[#0c0e14] font-bold transition-all shadow-[0_4px_14px_rgba(16,185,129,0.2)]"
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <p className="text-[10px] text-center text-white/30 mt-3 font-medium">Disclaimer: Alex is an AI assistant, not a licensed physiotherapist. Consult a qualified physio.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
