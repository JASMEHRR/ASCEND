import { Gift, Sparkles } from 'lucide-react';
import Modal from './ui/Modal';

interface RewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  rewardContent: string;
}

export default function RewardModal({ isOpen, onClose, rewardContent }: RewardModalProps) {
  return (
    <Modal open={isOpen} onClose={onClose} maxWidthClass="max-w-sm" hideClose>
      <div className="relative text-center -m-6 p-8">
        {/* Ambient brand glow behind the reward content */}
        <div className="absolute inset-0 bg-gradient-to-tr from-brand-500/10 via-transparent to-brand-500/5 pointer-events-none" />

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
          className="w-full py-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-black font-bold uppercase tracking-wider text-[11px] transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-95"
        >
          Claim Reward
        </button>
      </div>
    </Modal>
  );
}
