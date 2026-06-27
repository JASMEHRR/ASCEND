import { useState } from 'react';
import { OSState, VisionItem } from '../types';
import { Plus, Trash2, Image as ImageIcon, Sparkles, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

export default function VisionBoard({ state, updateState }: Props) {
  const [showInput, setShowInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const addVisionItem = () => {
    if (!newUrl.trim()) return;
    
    const newItem: VisionItem = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTitle || 'Target Manifestation',
      url: newUrl,
      createdAt: new Date().toISOString()
    };

    updateState(prev => ({
      ...prev,
      visionBoard: [newItem, ...(prev.visionBoard || [])]
    }));

    setNewTitle('');
    setNewUrl('');
    setShowInput(false);
  };

  const deleteVisionItem = (id: string) => {
    updateState(prev => ({
      ...prev,
      visionBoard: (prev.visionBoard || []).filter(item => item.id !== id)
    }));
  };

  return (
    <div className="space-y-6 h-full flex flex-col pb-8">
      
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center px-1">
        <div>
          <h3 className="text-2xl sm:text-3.5xl font-black text-white tracking-tight drop-shadow-md">Vision Board</h3>
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] mt-1 font-bold">Mental Projections // Anchored Aspirations</p>
        </div>
        <button 
          onClick={() => setShowInput(!showInput)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-extrabold uppercase tracking-widest transition-all border shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-2xl cursor-pointer glass-shimmer ${showInput ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
        >
          <Plus size={14} className={showInput ? 'rotate-45 transition-transform' : 'transition-transform'} /> 
          {showInput ? 'Cancel' : 'Add Vision'}
        </button>
      </div>

      {/* INPUT DRAWER PANEL */}
      <AnimatePresence>
        {showInput && (
          <motion.div 
            initial={{ opacity: 0, y: -15, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -15, filter: 'blur(5px)' }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="liquid-glass-highlight rounded-[2.2rem] p-5 sm:p-6 space-y-4 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input 
                type="text" 
                placeholder="Aspiration Description (e.g., Swiss Alps Executive Retreat)" 
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-white/[0.04] border border-white/12 rounded-2xl p-4 text-xs sm:text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/20 transition-all font-semibold"
              />
              <input 
                type="text" 
                placeholder="Secure Image URL" 
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="bg-white/[0.04] border border-white/12 rounded-2xl p-4 text-xs sm:text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus:ring-1 focus:ring-white/20 transition-all font-semibold"
              />
            </div>
            <button 
              onClick={addVisionItem}
              className="w-full bg-gradient-to-r from-white/5 to-white/10 hover:from-white/10 hover:to-white/15 border border-white/15 hover:border-white/25 text-white py-4 rounded-2xl font-black transition-all text-[11px] uppercase tracking-[0.2em] shadow-md cursor-pointer backdrop-blur-md"
            >
              Anchor Vision Protocol
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OUTPUT PROTOCOLS GRID */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
          <AnimatePresence mode="popLayout">
            {(state.visionBoard || []).map((item) => (
              <motion.div 
                layout
                key={item.id}
                initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                className="group relative liquid-glass-panel border-white/12 shadow-[0_20px_45px_-15px_rgba(0,0,0,0.8)] rounded-[2.2rem] overflow-hidden aspect-[4/3] flex flex-col hover:border-white/25 transition-all duration-500"
              >
                <img 
                  src={item.url} 
                  alt={item.title} 
                  className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://images.unsplash.com/photo-1518005020411-38b83d93c91d?q=80&w=600&auto=format&fit=crop";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-85 group-hover:opacity-90 transition-opacity" />
                
                <div className="absolute bottom-0 left-0 right-0 p-5.5 flex justify-between items-end z-20">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="text-[8px] text-white/70 font-extrabold uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1">
                      <Sparkles size={10} /> Manifested Goal
                    </span>
                    <h4 className="text-[14px] font-black text-white truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pr-1 leading-snug">{item.title}</h4>
                  </div>
                  <button 
                    onClick={() => deleteVisionItem(item.id)}
                    className="p-2.5 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300 rounded-xl transition-all backdrop-blur-md opacity-0 group-hover:opacity-100 shadow-lg shrink-0 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {(state.visionBoard || []).length === 0 && (
            <div className="col-span-full py-24 flex flex-col items-center justify-center bg-white/[0.01] backdrop-blur-3xl border border-white/5 rounded-[2.5rem] border-dashed">
              <ImageIcon size={32} strokeWidth={1} className="mb-3 text-white/20 animate-pulse" />
              <p className="text-[10px] font-extrabold tracking-[0.15em] text-white/30 uppercase">No active strategic visions catalogued</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
