import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, X, Sparkles } from 'lucide-react';

interface RewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  rewardContent: string;
}

export default function RewardModal({ isOpen, onClose, rewardContent }: RewardModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
        />
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-[#0c0e14] border border-brand-500/30 p-8 shadow-[0_0_50px_rgba(16,185,129,0.2)] text-center"
        >
          {/* Confetti or ambient effect background */}
          <div className="absolute inset-0 bg-gradient-to-tr from-brand-500/10 via-transparent to-brand-500/5 pointer-events-none" />

          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/40 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>

          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 mb-6 relative">
             <div className="absolute inset-0 bg-brand-500/20 blur-xl rounded-full animate-pulse" />
             <Gift size={32} className="relative z-10" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2 font-sans tracking-tight">Milestone Reached!</h2>
          <p className="text-xs font-mono font-bold tracking-widest text-brand-400 uppercase mb-6 flex items-center justify-center gap-2">
            <Sparkles size={12} /> Mystery Reward Unlocked <Sparkles size={12} />
          </p>

          <div className="py-4 px-6 bg-white/5 border border-white/10 rounded-2xl mb-8 min-h-[80px] flex items-center justify-center relative shadow-inner">
            <p className="text-sm text-white/90 font-medium leading-relaxed italic relative z-10">
              "{rewardContent}"
            </p>
          </div>

          <button 
            onClick={onClose}
            className="w-full py-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-black font-bold uppercase tracking-wider text-[11px] transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95"
          >
            Claim Reward
          </button>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
