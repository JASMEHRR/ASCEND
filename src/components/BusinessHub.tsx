import { useState } from 'react';
import { OSState, Idea } from '../types';
import { Lightbulb, Send, Trash2, Calendar, Award, Compass, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

export default function BusinessHub({ state, updateState }: Props) {
  const [input, setInput] = useState('');

  const processIdea = () => {
    if (!input.trim()) return;
    
    const newIdea: Idea = {
      id: Math.random().toString(36).substr(2, 9),
      title: input.trim().split(' ').slice(0, 4).join(' ') + "...",
      desc: input.trim(),
      timestamp: new Date().toISOString()
    };

    updateState(prev => ({
      ...prev,
      ideas: [newIdea, ...prev.ideas]
    }));
    setInput('');
  };

  const deleteIdea = (id: string) => {
    updateState(prev => ({
      ...prev,
      ideas: prev.ideas.filter(idea => idea.id !== id)
    }));
  };

  return (
    <div className="space-y-6 h-full flex flex-col pb-8">
      
      {/* VENTURE ALPHA HEADER CARD */}
      <div className="liquid-glass-highlight p-6 sm:p-8 rounded-[2.5rem] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 relative overflow-hidden shadow-lg group">
        <div className="space-y-2 relative z-10">
          <p className="text-[10px] font-extrabold text-white/50 uppercase tracking-[0.2em] flex items-center gap-2">
            <Zap size={12} className="text-white/40" />
            PRIMARY OPERATIONAL MILESTONE // VENTURE ALPHA
          </p>
          <h3 className="text-2xl sm:text-3.5xl font-black text-white tracking-tight leading-none">
            Launch Before June 29
          </h3>
          <p className="text-xs text-[#94a3b8] font-medium tracking-wide">
            21st Birthday Target Exit // Decentralized Performance Identity
          </p>
        </div>
        
        <div className="text-left sm:text-right relative z-10 shrink-0">
          <span className="inline-block px-4.5 py-2 bg-white/5 border border-white/10 text-white/80 text-[10px] font-extrabold tracking-[0.15em] rounded-full uppercase">
            ACTIVE PILOT
          </span>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[40px] pointer-events-none translate-x-12 -translate-y-12" />
      </div>

      {/* STRATEGIC CAPTURED LOG (INPUT) */}
      <div className="liquid-glass-panel rounded-[2.2rem] p-5 sm:p-6 flex flex-col shadow-md">
        <div className="flex justify-between items-center mb-4 pl-1">
          <h3 className="text-[10px] font-extrabold text-white/50 uppercase tracking-[0.2em] flex items-center gap-2">
            <Compass size={13} className="text-white/40" />
            Strategic Direction Log
          </h3>
          <span className="text-[9px] px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/60 font-mono font-bold uppercase tracking-wider shadow-inner">
            Commit Hour Metric
          </span>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-white/[0.04] backdrop-blur-md rounded-2xl p-4 border border-white/12 focus:border-white/25 focus:ring-1 focus:ring-white/20 text-xs sm:text-sm text-white outline-none transition-all resize-none h-24 placeholder:text-white/30 leading-relaxed font-semibold" 
            placeholder="Draft next business move, tactical plan, or micro-venture proposal..."
          />
          <button 
            onClick={processIdea}
            className="sm:w-20 h-12 sm:h-auto bg-white/[0.08] hover:bg-white/[0.15] text-white/90 hover:text-white rounded-2xl flex items-center justify-center text-xs text-white/80 border border-white/12 hover:border-white/25 transition-all disabled:opacity-30 shadow-md active:scale-95 cursor-pointer font-extrabold uppercase tracking-widest"
            disabled={!input.trim()}
          >
            Log
          </button>
        </div>
      </div>

      {/* STRATEGIC OUTPUTS FEED (CARDS) */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
          <AnimatePresence mode="popLayout">
            {state.ideas.map((idea) => (
              <motion.div 
                layout
                key={idea.id}
                initial={{ opacity: 0, y: 15, filter: 'blur(5px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(5px)' }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                className="liquid-glass-panel rounded-[2rem] p-6 space-y-4 relative group hover:border-white/18 hover:bg-white/[0.03] transition-all duration-300"
              >
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-extrabold text-white/50 uppercase tracking-[0.15em] flex items-center gap-1.5 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/10">
                     <Award size={10} /> Active Strategy
                  </span>
                  <button 
                    onClick={() => deleteIdea(idea.id)} 
                    className="text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer p-1 rounded-lg hover:bg-white/5"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                
                <h4 className="text-[14px] font-black text-white leading-snug tracking-normal">{idea.title}</h4>
                <p className="text-xs text-white/60 leading-relaxed font-semibold bg-white/[0.03] p-3.5 rounded-2xl border border-white/10 shadow-sm">
                  "{idea.desc}"
                </p>
                
                <div className="pt-3 border-t border-white/5 flex justify-between items-center text-[9px] font-mono font-bold uppercase tracking-widest text-white/30">
                  <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(idea.timestamp).toLocaleDateString()}</span>
                  <span>DRAFT STAGE</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {state.ideas.length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2.5rem] bg-white/[0.01]">
              <Compass size={24} className="text-white/10 mb-3 animate-pulse" />
              <p className="text-[10px] font-extrabold text-white/20 uppercase tracking-[0.2em] italic">No active strategic directions stored.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
