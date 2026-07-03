import { X, Clipboard } from 'lucide-react';
import { OSState } from '../types';
import CountdownTimer from './CountdownTimer';
import AtmosphereSelector from './AtmosphereSelector';
import { useDialog } from '../context/DialogContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  updateState: (updater: (prev: OSState) => OSState) => void;
  logs: string[];
  selectedAtmosphereMode: string;
  setSelectedAtmosphereMode: (mode: string) => void;
}

export default function SystemLogsModal({
  isOpen,
  onClose,
  updateState,
  logs,
  selectedAtmosphereMode,
  setSelectedAtmosphereMode
}: Props) {
  const { confirm } = useDialog();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#090b11]/95 text-[#f4f4f5] border border-white/12 rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header decoration */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        
        {/* Modal Top title bar */}
        <div className="p-6 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
          <div className="flex items-center gap-2.5">
            <Clipboard size={16} className="text-white/60 animate-pulse" />
            <span className="text-[11px] font-mono font-black uppercase tracking-[0.22em] text-white/90">System Command Center & Controls</span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/15 hover:border-white/25 text-white/60 hover:text-white transition-all cursor-pointer shadow-sm"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Dialog Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1 text-sm">
          
          {/* Sanctuary Atmosphere Selector */}
          <section className="bg-white/[0.02] border border-white/8 rounded-2xl p-4.5 space-y-3">
            <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em] pl-1 block">
              ⭐ Sanctuary Atmosphere
            </span>
            <AtmosphereSelector value={selectedAtmosphereMode} onChange={setSelectedAtmosphereMode} />
          </section>

          {/* Section: Protocol Countdowns */}
          <section className="space-y-3">
            <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em] pl-1 block">Protocol Timers</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CountdownTimer label="Trip Expedition" targetDate="2026-06-10T00:00:00" />
              <CountdownTimer label="Launch milestone" targetDate="2026-06-29T00:00:00" />
            </div>
          </section>

          {/* Clinical Directives */}
          <section className="space-y-3">
            <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em] pl-1 block">Clinical Directives</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/10 border-l-white/45 shadow-sm">
                <p className="text-[10px] font-extrabold text-white uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" /> The Pain Rule
                </p>
                <p className="text-[11px] text-white/60 leading-relaxed font-semibold">Stop if pain travels down leg. Centralization is key for recovery.</p>
              </div>
              <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/10 border-l-white/75 shadow-sm">
                <p className="text-[10px] font-extrabold text-white uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/70" /> Altitude Protocol
                </p>
                <p className="text-[11px] text-white/60 leading-relaxed font-semibold">Prioritize incline walking. Minimize spinal jarring at 9,000ft.</p>
              </div>
            </div>
          </section>

          {/* Core System Developer Logs Frame */}
          <section className="space-y-2.5">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-[0.18em] pl-1">Operational Telemetry Stream</span>
            <div className="bg-black/80 font-mono text-[10.5px] rounded-2xl border border-white/10 p-4 space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar shadow-inner text-white/70">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-white/20 select-none">[{index + 1}]</span>
                  <span className="flex-1 whitespace-pre-wrap">{log}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Daily reset */}
          <section className="pt-4 border-t border-white/5">
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset today?',
                  message: 'This clears today’s rituals, workouts, tasks, and hydration. Your XP and long-term data are kept.',
                  confirmLabel: 'Reset day',
                  danger: true,
                });
                if (!ok) return;
                updateState((s) => ({
                  ...s,
                  rituals: {},
                  exerciseAM: {},
                  exercisePM: {},
                  tasks: [],
                  water: 0,
                  primaryObjective: s.primaryObjective ? { ...s.primaryObjective, done: false } : s.primaryObjective,
                }));
              }}
              className="w-full py-3 px-4 bg-white/5 hover:bg-white/12 text-white/80 hover:text-white text-[10px] font-extrabold rounded-xl transition-all uppercase tracking-[0.15em] border border-white/10 hover:border-white/20 cursor-pointer shadow-sm text-center"
            >
              Day Protocol Reset
            </button>
          </section>

        </div>

        {/* Footer info bar */}
        <div className="bg-white/[0.01] px-6 py-4 border-t border-white/5 flex justify-end items-center text-[9px] font-mono text-white/25 tracking-wider">
          <span>Ascend Protocol</span>
        </div>

      </div>
    </div>
  );
}
