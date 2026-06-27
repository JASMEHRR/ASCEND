import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Unlock, Plus, ShoppingCart, KeyRound } from 'lucide-react';
import AnimatedCheckboxItem from './AnimatedCheckboxItem';
import { OSState } from '../types';

interface BuyItem {
  id: string;
  name: string;
  done: boolean;
}

interface ToBuyListProps {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

export default function ToBuyList({ state, updateState }: ToBuyListProps) {
  const [passcode, setPasscode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [items, setItems] = useState<BuyItem[]>(() => {
    try {
      const stored = localStorage.getItem('ascend_tobuy_items');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const savedCode = localStorage.getItem('ascend_tobuy_passcode');
      if (savedCode) setPasscode(savedCode);
    } catch (e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem('ascend_tobuy_items', JSON.stringify(items));
  }, [items]);

  const handleSetPasscode = () => {
    if (inputCode.length >= 4) {
      setPasscode(inputCode);
      localStorage.setItem('ascend_tobuy_passcode', inputCode);
      setIsUnlocked(true);
      setInputCode('');
    } else {
      alert("Passcode must be at least 4 characters long.");
    }
  };

  const handleUnlock = () => {
    if (inputCode === passcode) {
      setIsUnlocked(true);
      setInputCode('');
    } else {
      alert("Incorrect passcode");
    }
  };

  const addItem = () => {
    const text = prompt("Enter item to buy:");
    if (text) {
      setItems(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: text, done: false }]);
    }
  };

  const toggleItem = (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, done: !item.done } : item));
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const resetPasscode = () => {
    if (confirm("Are you sure you want to reset your master passcode?")) {
      setPasscode('');
      localStorage.removeItem('ascend_tobuy_passcode');
      setIsUnlocked(false);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="h-full flex flex-col items-center justify-center -mt-16 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center mb-6 shadow-inner">
            <Lock size={28} className="text-white/80 drop-shadow-sm" />
          </div>
          <h2 className="text-xl font-bold font-plus text-white tracking-tight mb-2">Classified Terminal</h2>
          <p className="text-xs text-white/50 font-mono tracking-widest mb-8 uppercase">
            {passcode ? "ENTER MASTER PASSCODE" : "INITIALIZE SECURITY PASSCODE"}
          </p>

          <input
            type="password"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    if (passcode) handleUnlock();
                    else handleSetPasscode();
                }
            }}
            placeholder="••••"
            className="w-full bg-black/40 border border-white/20 text-white font-mono text-center text-xl tracking-[0.5em] rounded-xl px-4 py-4 outline-none focus:border-amber-400/50 transition-colors mb-4 placeholder:text-white/20"
            autoFocus
          />

          <button
            onClick={passcode ? handleUnlock : handleSetPasscode}
            className="w-full py-4 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(251,191,36,0.1)] hover:shadow-[0_0_20px_rgba(251,191,36,0.2)]"
          >
            {passcode ? "DECRYPT & ACCESS" : "SET MASTER PASSCODE"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full pt-2">
      <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-400/10 rounded-lg border border-amber-400/20">
              <ShoppingCart size={20} className="text-amber-400" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight font-plus">To Buy Ledger</h2>
          </div>
          <p className="text-xs text-white/50 font-mono uppercase tracking-widest flex items-center gap-2">
            <Unlock size={12} className="text-amber-400" /> DECRYPTED VAULT
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={resetPasscode}
            className="flex items-center gap-2 px-4 py-3 bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white border border-white/10 rounded-full text-[11px] font-extrabold uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            <KeyRound size={14} /> Change Pass
          </button>
          <button 
            onClick={addItem}
            className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-white/90 text-black rounded-full text-[11px] font-extrabold uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20 space-y-3">
        {items.map((item) => (
          <AnimatedCheckboxItem
            key={item.id}
            id={item.id}
            name={item.name}
            isDone={item.done}
            onToggle={toggleItem}
            onDelete={deleteItem}
            className="!p-5 !text-sm bg-white/[0.02]"
          />
        ))}
        {items.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center p-20 border border-dashed border-white/10 rounded-3xl bg-white/[0.01]"
          >
            <ShoppingCart size={48} className="text-white/10 mb-4" />
            <p className="text-white/40 font-mono text-xs font-bold uppercase tracking-widest">Vault is empty.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
