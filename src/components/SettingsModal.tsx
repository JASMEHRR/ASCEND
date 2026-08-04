import { useState } from 'react';
import { X, Settings2, Lock, Volume2, Blocks, Bot, Palette, Plug, LifeBuoy, GripVertical, Eye, EyeOff, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';
import { OSState } from '../types';
import SanctuaryBackgrounds from './SanctuaryBackgrounds';
import { useDialog } from '../context/DialogContext';
import { useJarvis } from '../features/jarvis/engine/JarvisProvider';
import ObsidianSettings from '../features/obsidian/ObsidianSettings';
import RemindersSettings from '../features/reminders/RemindersSettings';
import KiteSettings from '../features/kite/KiteSettings';
import GoogleSettings from '../features/google/GoogleSettings';
import type { FeaturesApi } from '../features/useFeatures';
import { FEATURES, type FeatureModule } from '../features/registry';
import { ELEVEN_PREFIX, ELEVEN_VOICES } from '../features/jarvis/voice/useVoice';

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

type SettingsTab = 'modules' | 'jarvis' | 'appearance' | 'connections' | 'data';

/** Named transparency stops; 65% is the recommended balance. */
const GLASS_PRESETS: { label: string; value: number; recommended?: boolean }[] = [
  { label: 'Ghost', value: 20 },
  { label: 'Airy', value: 40 },
  { label: 'Balanced', value: 65, recommended: true },
  { label: 'Frosted', value: 85 },
  { label: 'Solid', value: 100 },
];

const TABS: { id: SettingsTab; label: string; brief: string; icon: typeof Blocks }[] = [
  { id: 'modules', label: 'Modules', brief: 'What appears in the app', icon: Blocks },
  { id: 'jarvis', label: 'Jarvis', brief: 'Voice and behaviour', icon: Bot },
  { id: 'appearance', label: 'Appearance', brief: 'Theme, glass, atmosphere', icon: Palette },
  { id: 'connections', label: 'Connections', brief: 'Google, Obsidian, Zerodha', icon: Plug },
  { id: 'data', label: 'Data', brief: 'Reset and recovery', icon: LifeBuoy },
];

/** Section heading used inside each settings tab. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">{children}</span>
  );
}

/** Lightweight settings: modules, sanctuary atmosphere + reset today's progress. */
export default function SettingsModal({ isOpen, onClose, state, updateState, features, selectedAtmosphereMode, setSelectedAtmosphereMode }: Props) {
  const { confirm } = useDialog();
  const { voice } = useJarvis();
  const [tab, setTab] = useState<SettingsTab>('modules');
  if (!isOpen) return null;

  const glassOpacity = state.glassOpacity ?? 1;
  const setGlassOpacity = (v: number) => updateState((s) => ({ ...s, glassOpacity: v }));
  const glassBlur = state.glassBlur ?? 20;
  const setGlassBlur = (v: number) => updateState((s) => ({ ...s, glassBlur: v }));
  const showWishes = state.showWishes ?? true;
  const toggleShowWishes = () => updateState((s) => ({ ...s, showWishes: !(s.showWishes ?? true) }));

  const englishVoices = voice.voices.filter((v) => /^en[-_]/i.test(v.lang));
  const pickerVoices = englishVoices.length ? englishVoices : voice.voices;

  const activeHours = state.jarvisPrefs?.activeHours ?? { start: 8, end: 22 };
  const setActiveHours = (patch: Partial<{ start: number; end: number }>) =>
    updateState((s) => ({
      ...s,
      jarvisPrefs: { ...(s.jarvisPrefs ?? {}), activeHours: { ...(s.jarvisPrefs?.activeHours ?? { start: 8, end: 22 }), ...patch } },
    }));
  const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative flex h-[85vh] max-h-[820px] w-full max-w-4xl flex-col liquid-glass-panel bg-surface/80 text-white rounded-[1.75rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings2 size={15} className="text-white/60" />
            <span className="text-sm font-bold tracking-tight text-white">Settings</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Section rail */}
          <nav className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto custom-scrollbar border-r border-white/8 p-3 sm:flex" aria-label="Settings sections">
            {TABS.map(({ id, label, brief, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-white/20 bg-white/15 text-white'
                      : 'border-transparent text-white/45 hover:bg-white/[0.06] hover:text-white/85'
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${active ? 'text-white' : 'text-white/40'}`}><Icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-bold leading-tight">{label}</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-white/35">{brief}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Mobile section switcher */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-1 overflow-x-auto border-b border-white/8 px-3 py-2 sm:hidden">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                    tab === id ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/85'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {tab === 'modules' && (
          <section className="space-y-3">
            <div className="space-y-0.5">
              <SectionTitle>Modules</SectionTitle>
              <p className="text-[11px] text-white/35 leading-snug">Turn features on or off. Disabled modules vanish from the app; their data is kept and returns exactly as it was when re-enabled.</p>
            </div>
            <div className="space-y-1.5">
              {features.toggleable.map((mod) => {
                const Icon = mod.icon;
                const on = features.isEnabled(mod.id);
                return (
                  <div key={mod.id}>
                    <button
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
                  </div>
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

            {/* Sidebar arrangement — order and visibility, independent of enable/disable. */}
            <div className="space-y-2 border-t border-white/8 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <SectionTitle>Sidebar</SectionTitle>
                  <p className="text-[11px] text-white/35 leading-snug">Reorder or hide entries. Hiding keeps the module on — it just leaves the rail.</p>
                </div>
                <button
                  onClick={features.resetNav}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] font-semibold text-white/50 hover:text-white/85 hover:border-white/20 transition-all cursor-pointer"
                >
                  <RotateCcw size={11} /> Reset
                </button>
              </div>
              <div className="space-y-1.5">
                {features.navAll.map((mod, i) => {
                  const Icon = mod.icon;
                  const hidden = features.isNavHidden(mod.id);
                  return (
                    <div
                      key={mod.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-all ${
                        hidden ? 'border-white/5 bg-white/[0.015] opacity-55' : 'border-white/8 bg-white/[0.03]'
                      }`}
                    >
                      <GripVertical size={13} className="shrink-0 text-white/20" />
                      <span className={hidden ? 'text-white/25' : 'text-brand-300'}><Icon size={15} /></span>
                      <span className="flex-1 min-w-0 truncate text-[12px] font-bold text-white/85">{mod.label}</span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          onClick={() => features.moveNav(mod.id, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${mod.label} up`}
                          className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          onClick={() => features.moveNav(mod.id, 1)}
                          disabled={i === features.navAll.length - 1}
                          aria-label={`Move ${mod.label} down`}
                          className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          onClick={() => features.toggleNavHidden(mod.id)}
                          aria-label={hidden ? `Show ${mod.label}` : `Hide ${mod.label}`}
                          title={hidden ? 'Show in sidebar' : 'Hide from sidebar'}
                          className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                            hidden ? 'text-white/30 hover:text-white/70' : 'text-brand-400/70 hover:text-brand-300'
                          } hover:bg-white/10`}
                        >
                          {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          )}

          {tab === 'jarvis' && (
          <section className="space-y-2">
            <SectionTitle>Jarvis</SectionTitle>
            {/* Proactive greeting on login now lives on the main dashboard,
                right by the orb it affects — see JarvisDashboard.tsx. */}

            <div className="px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-bold text-white/85 leading-tight">Voice</span>
                  <span className="block text-[10.5px] text-white/35">Pinned — Jarvis sounds the same every session.</span>
                </span>
                <select
                  value={voice.voiceURI ?? ''}
                  onChange={(e) => voice.setVoiceURI(e.target.value)}
                  aria-label="Jarvis voice"
                  className="max-w-[40%] rounded-xl border border-white/12 bg-surface px-2 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand-400/40 cursor-pointer"
                >
                  <optgroup label="ElevenLabs — premium">
                    {ELEVEN_VOICES.map((v) => (
                      <option key={v.id} value={`${ELEVEN_PREFIX}${v.id}`}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                  {pickerVoices.length > 0 && (
                    <optgroup label="Browser voices">
                      {pickerVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  onClick={() => voice.speak('Voice check complete. All systems nominal.')}
                  aria-label="Test voice"
                  className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
                >
                  <Volume2 size={14} />
                </button>
              </div>
              {voice.elevenStatus === 'down' && voice.voiceURI?.startsWith(ELEVEN_PREFIX) && (
                <p className="text-[10.5px] text-amber-300/80 leading-snug">
                  ElevenLabs quota reached — using the browser voice until it resets.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/8">
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-bold text-white/85 leading-tight">Insight hours</span>
                <span className="block text-[10.5px] text-white/35">Proactive nudges stay silent outside this window.</span>
              </span>
              {(['start', 'end'] as const).map((edge) => (
                <select
                  key={edge}
                  value={activeHours[edge]}
                  onChange={(e) => setActiveHours({ [edge]: Number(e.target.value) })}
                  aria-label={`Active hours ${edge}`}
                  className="rounded-xl border border-white/12 bg-surface px-2 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand-400/40 cursor-pointer"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </section>
          )}

          {tab === 'appearance' && (
          <section className="space-y-2">
            <SectionTitle>Appearance</SectionTitle>

            {/* Global glass transparency — drives --glass-opacity for every surface. */}
            <div className="px-3.5 py-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-bold text-white/85 leading-tight">Glass transparency</span>
                  <span className="block text-[10.5px] text-white/35">Lower lets more of the atmosphere through every panel.</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] font-bold text-brand-300">{Math.round(glassOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(glassOpacity * 100)}
                onChange={(e) => setGlassOpacity(Number(e.target.value) / 100)}
                aria-label="Glass transparency"
                className="w-full accent-brand-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-white/25">
                <span>See-through</span>
                <span>Solid</span>
              </div>

              {/* Presets — 65% is the recommended balance of legibility and atmosphere. */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {GLASS_PRESETS.map((p) => {
                  const active = Math.round(glassOpacity * 100) === p.value;
                  return (
                    <button
                      key={p.value}
                      onClick={() => setGlassOpacity(p.value / 100)}
                      className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-all cursor-pointer ${
                        active
                          ? 'border-brand-400/50 bg-brand-500/20 text-brand-200'
                          : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white/85 hover:border-white/20'
                      }`}
                    >
                      {p.label}
                      {p.recommended && <span className="ml-1 text-brand-400/70">·</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-white/30">
                Recommended: <button onClick={() => setGlassOpacity(0.65)} className="font-semibold text-brand-400/80 hover:text-brand-300 cursor-pointer">Balanced (65%)</button>
              </p>
            </div>

            {/* Blur is independent — some prefer see-through but sharp. */}
            <div className="px-3.5 py-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-bold text-white/85 leading-tight">Background blur</span>
                  <span className="block text-[10.5px] text-white/35">How much the atmosphere is softened behind panels.</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] font-bold text-brand-300">{glassBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={2}
                value={glassBlur}
                onChange={(e) => setGlassBlur(Number(e.target.value))}
                aria-label="Background blur"
                className="w-full accent-brand-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-white/25">
                <span>Sharp</span>
                <span>Frosted</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <SectionTitle>Sanctuary Atmosphere</SectionTitle>
              <SanctuaryBackgrounds
                value={selectedAtmosphereMode}
                onChange={setSelectedAtmosphereMode}
                customBackgrounds={state.customBackgrounds ?? []}
                updateState={updateState}
              />
            </div>

            <button
              onClick={toggleShowWishes}
              role="switch"
              aria-checked={showWishes}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] hover:border-white/15 transition-all cursor-pointer text-left"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-bold text-white/85 leading-tight">Wish counter</span>
                <span className="block text-[10.5px] text-white/35">Shows the wish count on the dashboard.</span>
              </span>
              <ToggleTrack on={showWishes} />
            </button>
          </section>
          )}

          {tab === 'connections' && (
          <section className="space-y-4">
            <div className="space-y-0.5">
              <SectionTitle>Connections</SectionTitle>
              <p className="text-[11px] text-white/35 leading-snug">External services Ascend can read from. Each is optional.</p>
            </div>
            <RemindersSettings />
            <div className="border-t border-white/8 pt-4">
              <GoogleSettings />
            </div>
            <div className="border-t border-white/8 pt-4">
              <ObsidianSettings />
            </div>
            <div className="border-t border-white/8 pt-4">
              <KiteSettings />
            </div>
          </section>
          )}

          {tab === 'data' && (
          <section className="space-y-3">
            <div className="space-y-0.5">
              <SectionTitle>Data</SectionTitle>
              <p className="text-[11px] text-white/35 leading-snug">Your XP, streak, and long-term history are never touched by the actions here.</p>
            </div>
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset today?',
                  message: "This clears today's tasks and hydration. Your habits, XP, streak, and long-term data are kept.",
                  confirmLabel: 'Reset day',
                  danger: true,
                });
                if (!ok) return;
                updateState((s) => ({
                  ...s,
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
          )}
            </div>
          </div>
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
