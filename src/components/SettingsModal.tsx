import { X, Settings2, Lock, Volume2 } from 'lucide-react';
import { OSState } from '../types';
import AtmosphereSelector from './AtmosphereSelector';
import { useDialog } from '../context/DialogContext';
import { useJarvis } from '../features/jarvis/engine/JarvisProvider';
import ObsidianSettings from '../features/obsidian/ObsidianSettings';
import type { FeaturesApi } from '../features/useFeatures';
import { FEATURES, type FeatureModule } from '../features/registry';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  features: FeaturesApi;
  selectedAtmosphereMode: string;
  setSelectedAtmosphereMode: (mode: string) => void;
}

const COMING_SOON: FeatureModule[] = FEATURES.filter((f) => f.status === 'coming-soon');

/** Lightweight settings: modules, sanctuary atmosphere + reset today's progress. */
export default function SettingsModal({ isOpen, onClose, state, updateState, features, selectedAtmosphereMode, setSelectedAtmosphereMode }: Props) {
  const { confirm } = useDialog();
  const { voice } = useJarvis();
  if (!isOpen) return null;

  const englishVoices = voice.voices.filter((v) => /^en[-_]/i.test(v.lang));
  const pickerVoices = englishVoices.length ? englishVoices : voice.voices;

  const greetOnLogin = state.jarvisPrefs?.greetOnLogin ?? true;
  const toggleGreet = () =>
    updateState((s) => ({
      ...s,
      jarvisPrefs: { ...(s.jarvisPrefs ?? {}), greetOnLogin: !(s.jarvisPrefs?.greetOnLogin ?? true) },
    }));

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

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <section className="space-y-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Modules</span>
              <p className="text-[11px] text-white/35 leading-snug">Turn features on or off. Disabled modules vanish from the app; their data is kept and returns exactly as it was when re-enabled.</p>
            </div>
            <div className="space-y-1.5">
              {features.toggleable.map((mod) => {
                const Icon = mod.icon;
                const on = features.isEnabled(mod.id);
                return (
                  <button
                    key={mod.id}
                    onClick={() => features.toggle(mod.id)}
                    role="switch"
                    aria-checked={on}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] hover:border-white/15 transition-all cursor-pointer text-left"
                  >
                    <span className={on ? 'text-brand-300' : 'text-white/35'}><Icon size={16} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] font-bold text-white/85 leading-tight">{mod.label}</span>
                      <span className="block text-[10.5px] text-white/35 truncate">{mod.description}</span>
                    </span>
                    <ToggleTrack on={on} />
                  </button>
                );
              })}
            </div>

            {COMING_SOON.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[9px] font-mono font-bold text-white/25 uppercase tracking-[0.18em]">Coming soon</span>
                {COMING_SOON.map((mod) => {
                  const Icon = mod.icon;
                  return (
                    <div key={mod.id} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-white/[0.015] border border-white/5 opacity-60">
                      <span className="text-white/25"><Icon size={16} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-bold text-white/55 leading-tight">{mod.label}</span>
                        <span className="block text-[10.5px] text-white/25 truncate">{mod.description}</span>
                      </span>
                      <Lock size={13} className="text-white/25 shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2 border-t border-white/8 pt-4">
            <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Jarvis</span>
            <button
              onClick={toggleGreet}
              role="switch"
              aria-checked={greetOnLogin}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] hover:border-white/15 transition-all cursor-pointer text-left"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-bold text-white/85 leading-tight">Proactive greeting on login</span>
                <span className="block text-[10.5px] text-white/35">When off, Jarvis stays idle until you speak first.</span>
              </span>
              <ToggleTrack on={greetOnLogin} />
            </button>

            {pickerVoices.length > 0 && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/8">
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-bold text-white/85 leading-tight">Voice</span>
                  <span className="block text-[10.5px] text-white/35">Pinned — Jarvis sounds the same every session.</span>
                </span>
                <select
                  value={voice.voiceURI ?? ''}
                  onChange={(e) => voice.setVoiceURI(e.target.value)}
                  aria-label="Jarvis voice"
                  className="max-w-[40%] rounded-xl border border-white/12 bg-[#0b0d13] px-2 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand-400/40 cursor-pointer"
                >
                  {pickerVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => voice.speak('Voice check complete. All systems nominal, sir.')}
                  aria-label="Test voice"
                  className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
                >
                  <Volume2 size={14} />
                </button>
              </div>
            )}
          </section>

          <section className="space-y-2 border-t border-white/8 pt-4">
            <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Sanctuary Atmosphere</span>
            <AtmosphereSelector value={selectedAtmosphereMode} onChange={setSelectedAtmosphereMode} />
          </section>

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

/** A small liquid-glass on/off track used by the module toggles. */
function ToggleTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors ${
        on ? 'bg-brand-500/30 border-brand-400/50' : 'bg-white/8 border-white/12'
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 h-[16px] w-[16px] rounded-full bg-white shadow transition-all ${
          on ? 'left-[19px]' : 'left-[3px]'
        }`}
      />
    </span>
  );
}
