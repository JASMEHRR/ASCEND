import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity, User, Bot, ArrowRight } from 'lucide-react';
import type { OSState } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

export default function PhysioAI({ state }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey! I'm Alex, your personal physiotherapist. I know about your lumbar disc, posture, tailbone, knock knees, and right foot.\n\nTell me how you're feeling and we'll take it from there.",
    }
  ]);
  const [inputStr, setInputStr] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Build standard history context without repeating pain summary in UI
    const newUserMsg: Message = { role: 'user', content: text };
    
    const historyForBackend = [...messages, newUserMsg];

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

  return (
    <div className="w-full h-full min-h-0 flex flex-col gap-4 overflow-hidden px-1">

      {/* Header Area */}
      <div className="liquid-glass-panel rounded-3xl px-6 py-4 flex flex-col sm:flex-row gap-5 relative overflow-hidden shrink-0">
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

      <div className="flex-1 min-h-0 flex pb-1">
        {/* Chat Interface — the only scroll surface on this screen. */}
        <div className="flex-1 flex flex-col min-h-0 liquid-glass-panel rounded-3xl overflow-hidden relative">
          
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
                    : 'bg-white/[0.06] border border-white/10 text-white/90 rounded-tl-sm backdrop-blur-md'
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
                <div className="px-5 py-3.5 bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-sm flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </div>

          <div className="p-4 shrink-0 border-t border-white/8 relative z-10">
            <div className="relative flex items-center">
              <input 
                type="text" 
                value={inputStr}
                onChange={e => setInputStr(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage(inputStr)}
                placeholder="Describe your symptoms or ask Alex anything..."
                className="w-full liquid-glass-input rounded-2xl pl-5 pr-14 py-4 text-sm text-white placeholder-white/30 outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50"
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
