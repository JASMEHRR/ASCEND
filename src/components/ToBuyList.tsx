import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Unlock, Plus, ShoppingCart, KeyRound } from 'lucide-react';
import AnimatedCheckboxItem from './AnimatedCheckboxItem';
import PasscodeGate from './ui/PasscodeGate';
import { OSState } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';

interface BuyItem {
  id: string;
  name: string;
  done: boolean;
}

interface ToBuyListProps {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

/**
 * Privacy-locked purchase ledger. The passcode is SHA-256 hashed (shared
 * PasscodeGate) — the previous plaintext value at `ascend_tobuy_passcode_*` is
 * migrated to a hash once on first unlock. Items stay in localStorage by design
 * (kept off the synced cloud state), namespaced per user.
 */
export default function ToBuyList(_props: ToBuyListProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? 'guest';

  return (
    <PasscodeGate
      hashKey={`ascend_tobuy_passhash_${uid}`}
      legacyPlainKey={`ascend_tobuy_passcode_${uid}`}
      uid={user?.uid ?? null}
      title="Classified Terminal"
    >
      <ToBuyLedger uid={uid} />
    </PasscodeGate>
  );
}

function ToBuyLedger({ uid }: { uid: string }) {
  const { prompt, confirm } = useDialog();
  const itemsKey = `ascend_tobuy_items_${uid}`;
  const [items, setItems] = useState<BuyItem[]>([]);

  // Load this user's vault whenever the user changes.
  useEffect(() => {
    try {
      const storedItems = localStorage.getItem(itemsKey);
      setItems(storedItems ? JSON.parse(storedItems) : []);
    } catch {
      setItems([]);
    }
  }, [itemsKey]);

  useEffect(() => {
    localStorage.setItem(itemsKey, JSON.stringify(items));
  }, [items, itemsKey]);

  const addItem = async () => {
    const text = await prompt({ title: 'Add item', placeholder: 'What do you need to buy?' });
    if (text) {
      setItems((prev) => [...prev, { id: crypto.randomUUID(), name: text, done: false }]);
    }
  };

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const resetPasscode = async () => {
    if (
      await confirm({
        title: 'Reset passcode?',
        message: 'You will set a new master passcode on next unlock.',
        confirmLabel: 'Reset',
        danger: true,
      })
    ) {
      localStorage.removeItem(`ascend_tobuy_passhash_${uid}`);
      localStorage.removeItem(`ascend_tobuy_passcode_${uid}`);
      // Re-lock by reloading the gated view.
      window.location.reload();
    }
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full pt-2">
      <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-400/10 rounded-lg border border-brand-400/20">
              <ShoppingCart size={20} className="text-brand-400" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight font-plus">To Buy Ledger</h2>
          </div>
          <p className="text-xs text-white/50 font-mono uppercase tracking-widest flex items-center gap-2">
            <Unlock size={12} className="text-brand-400" /> DECRYPTED VAULT
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
