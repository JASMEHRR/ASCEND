import { X, Settings2 } from 'lucide-react';
import { OSState } from '../types';
import AtmosphereSelector from './AtmosphereSelector';
import { useDialog } from '../context/DialogContext';
import ObsidianSettings from '../features/obsidian/ObsidianSettings';
import RemindersSettings from '../features/reminders/RemindersSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  updateState: (updater: (prev: OSState) => OSState) => void;
  selectedAtmosphereMode: string;
  setSelectedAtmosphereMode: (mode: string) => void;
}

/** Lightweight settings: sanctuary atmosphere + reset today's progress. */
export default function SettingsModal({ isOpen, onClose, updateState, selectedAtmosphereMode, setSelectedAtmosphereMode }: Props) {
  const { confirm } = useDialog();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative w-full max-w-md bg-[#0b0d13]/95 text-[#f4f4f5] border border-white/12 rounded-[1.75rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <Settings2 size={15} className="text-white/60" />
            <span className="text-sm font-bold tracking-tight text-white">Settings</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <section className="space-y-2">
            <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Sanctuary Atmosphere</span>
            <AtmosphereSelector value={selectedAtmosphereMode} onChange={setSelectedAtmosphereMode} />
          </section>

          <div className="border-t border-white/8 pt-4">
            <RemindersSettings />
          </div>

          <div className="border-t border-white/8 pt-4">
            <ObsidianSettings />
          </div>

          <section className="pt-1 border-t border-white/8">
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset today?',
                  message: "This clears today's rituals, tasks, and hydration. Your XP, streak, and long-term data are kept.",
                  confirmLabel: 'Reset day',
                  danger: true,
                });
                if (!ok) return;
                updateState((s) => ({
                  ...s,
                  rituals: {},
                  tasks: [],
                  water: 0,
                  primaryObjective: s.primaryObjective ? { ...s.primaryObjective, done: false } : s.primaryObjective,
                }));
              }}
              className="w-full py-3 px-4 bg-white/5 hover:bg-white/12 text-white/80 hover:text-white text-[11px] font-extrabold rounded-xl transition-all uppercase tracking-[0.15em] border border-white/10 hover:border-white/20 cursor-pointer text-center"
            >
              Reset Today's Progress
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
