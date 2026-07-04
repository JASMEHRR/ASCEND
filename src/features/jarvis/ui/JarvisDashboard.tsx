import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Flame,
  Target,
  Droplets,
  Zap,
  Activity,
  Lightbulb,
  Plus,
  Check,
  ArrowRight,
  Gauge,
  ListChecks,
  Repeat,
  ScrollText,
  Sliders,
  X,
} from 'lucide-react';
import type { OSState } from '../../../types';
import { RITUALS } from '../../../constants';
import { useAuth } from '../../../context/AuthContext';
import { useDialog } from '../../../context/DialogContext';
import { disciplineScore } from '../../../lib/discipline';
import { effectiveStreak } from '../../../hooks/useStreak';
import { useJarvis } from '../engine/JarvisProvider';
import type { View } from '../context/appContext';
import JarvisConsole from './JarvisConsole';
import JarvisOrb, { useOrbState, type OrbState } from './JarvisOrb';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  setView: (v: View) => void;
  openSettings: () => void;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Working late';
}

const ORB_LABEL: Record<OrbState, string> = {
  idle: 'Online',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

const SUGGESTIONS = ['Plan my day', 'How am I doing?', 'What should I focus on?'];

/** The secondary panels — progressive disclosure, one expanded at a time. */
type DockPanel = 'vitals' | 'focus' | 'rituals' | 'actions' | 'activity';

const DOCK: { id: DockPanel; label: string; icon: React.ComponentType<{ size?: number | string }> }[] = [
  { id: 'vitals', label: 'Vitals', icon: Gauge },
  { id: 'focus', label: 'Focus & Tasks', icon: ListChecks },
  { id: 'rituals', label: 'Rituals', icon: Repeat },
  { id: 'actions', label: 'Command Deck', icon: Zap },
  { id: 'activity', label: 'Log', icon: ScrollText },
];

/**
 * The Jarvis home surface. Default state is deliberately minimal — the orb,
 * a greeting, and the console. Everything else (vitals, tasks, rituals, quick
 * actions, activity log) lives behind the collapsible dock at the bottom;
 * opening one panel closes the previous (progressive disclosure, whitespace
 * over density).
 */
export default function JarvisDashboard({ state, updateState, setView, openSettings }: Props) {
  const { user } = useAuth();
  const { prompt } = useDialog();
  const { sendMessage, memory, messages } = useJarvis();
  const orbState = useOrbState();
  const [openPanel, setOpenPanel] = useState<DockPanel | null>(null);

  const score = disciplineScore(state);
  const streak = effectiveStreak(state);
  const ritualsDone = Object.values(state.rituals).filter(Boolean).length;
  const openTasks = state.tasks.filter((t) => !t.done).length;
  const name = (user?.email ?? 'there').split('@')[0];
  const conversationStarted = messages.length > 1;

  const briefing = useMemo(() => {
    const bits: string[] = [`Discipline ${score}/100`];
    if (streak > 0) bits.push(`${streak}-day streak`);
    if (state.primaryObjective && !state.primaryObjective.done) bits.push(`focus: ${state.primaryObjective.text}`);
    if (openTasks) bits.push(`${openTasks} open task${openTasks === 1 ? '' : 's'}`);
    return bits.join(' · ');
  }, [score, streak, state.primaryObjective, openTasks]);

  const setFocus = async () => {
    const text = await prompt({ title: 'Set your focus', message: 'The one thing that matters most today.', placeholder: 'e.g. Ship the pitch deck' });
    if (text) updateState((p) => ({ ...p, primaryObjective: { text, done: false } }));
  };
  const toggleFocus = () => updateState((p) => (p.primaryObjective ? { ...p, primaryObjective: { ...p.primaryObjective, done: !p.primaryObjective.done } } : p));
  const addWater = () => updateState((p) => ({ ...p, water: p.water + 1 }));
  const toggleRitual = (id: string) => updateState((p) => ({ ...p, rituals: { ...p.rituals, [id]: !p.rituals[id] } }));

  const togglePanel = (id: DockPanel) => setOpenPanel((cur) => (cur === id ? null : id));

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      {/* Hero — the orb IS the home state. It yields vertical space once a conversation is underway. */}
      <div className={`flex flex-col items-center text-center transition-all ${conversationStarted ? 'gap-1.5 pt-0' : 'gap-3 pt-6 sm:pt-10'}`}>
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
          <JarvisOrb state={orbState} size={conversationStarted ? 88 : 148} />
        </motion.div>
        <div>
          <p className="flex items-center justify-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-[0.3em] text-brand-400">
            Jarvis
            <span className="font-normal normal-case tracking-normal text-white/40">· {ORB_LABEL[orbState]}</span>
          </p>
          {!conversationStarted && (
            <>
              <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {greeting()}, <span className="capitalize">{name}</span>.
              </h2>
              <p className="mt-1 text-[13px] text-white/45">{briefing}</p>
            </>
          )}
        </div>
      </div>

      {/* Console — the one always-present surface besides the orb. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        {!conversationStarted && (
          <div className="mb-2 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/60 transition-colors hover:border-brand-400/40 hover:text-white cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <JarvisConsole autoFocus />
        </div>

        {/* Recent-action chips — capped at 3; the rest roll into the Log panel. */}
        {memory.recentActions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {memory.recentActions.slice(0, 3).map((a, i) => (
              <button
                key={i}
                onClick={() => setOpenPanel('activity')}
                className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-white/45 hover:text-white/80 transition-colors cursor-pointer"
                title="Open the activity log"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.ok ? 'bg-brand-400' : 'bg-red-400/70'}`} />
                <span className="truncate">{a.summary}</span>
              </button>
            ))}
            {memory.recentActions.length > 3 && (
              <button onClick={() => setOpenPanel('activity')} className="text-[10.5px] text-white/30 hover:text-white/60 cursor-pointer">
                +{memory.recentActions.length - 3} more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded dock panel — one at a time, above the dock. */}
      <AnimatePresence mode="wait">
        {openPanel && (
          <motion.div
            key={openPanel}
            initial={{ opacity: 0, y: 12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 12, height: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="overflow-hidden"
          >
            <div className="liquid-glass-panel mt-3 rounded-[1.5rem] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
                  {DOCK.find((d) => d.id === openPanel)?.label}
                </p>
                <button onClick={() => setOpenPanel(null)} aria-label="Collapse panel" className="rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
                  <X size={13} />
                </button>
              </div>
              <div className="max-h-[38vh] overflow-y-auto custom-scrollbar pr-1">
                {openPanel === 'vitals' && (
                  <div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Metric icon={<Zap size={13} />} label="Discipline" value={`${score}`} sub="/100" tint="text-white" />
                      <Metric icon={<Flame size={13} />} label="Streak" value={`${streak}`} sub="days" tint="text-amber-400" />
                      <Metric icon={<Sparkles size={13} />} label="XP" value={`${state.points ?? 0}`} sub="pts" tint="text-brand-400" />
                      <Metric icon={<Droplets size={13} />} label="Water" value={`${state.water}`} sub="glasses" tint="text-sky-400" />
                    </div>
                    <button onClick={addWater} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer">
                      <Droplets size={12} /> Log a glass
                    </button>
                  </div>
                )}

                {openPanel === 'focus' && (
                  <div className="space-y-4">
                    <div>
                      <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
                        <Target size={12} /> Current focus
                      </p>
                      {state.primaryObjective ? (
                        <button onClick={toggleFocus} className="mt-2 flex w-full items-start gap-2.5 text-left cursor-pointer">
                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${state.primaryObjective.done ? 'border-brand-400 bg-brand-400 text-black' : 'border-white/25'}`}>
                            {state.primaryObjective.done && <Check size={12} strokeWidth={4} />}
                          </span>
                          <span className={`text-[14px] font-semibold leading-snug ${state.primaryObjective.done ? 'text-white/40 line-through' : 'text-white'}`}>{state.primaryObjective.text}</span>
                        </button>
                      ) : (
                        <button onClick={setFocus} className="mt-2 flex items-center gap-2 text-[13px] text-white/50 hover:text-white transition-colors cursor-pointer">
                          <Plus size={14} /> Set today's focus
                        </button>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Open tasks</p>
                        <button onClick={() => sendMessage('add a task')} className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 cursor-pointer">
                          <Plus size={12} /> Ask Jarvis
                        </button>
                      </div>
                      {openTasks === 0 ? (
                        <p className="text-[13px] text-white/35">Nothing pending. Tell Jarvis what to add.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {state.tasks.filter((t) => !t.done).map((t) => (
                            <li key={t.id}>
                              <button
                                onClick={() => updateState((p) => ({ ...p, tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, done: true } : x)) }))}
                                className="flex w-full items-center gap-2.5 text-left text-[13px] text-white/75 hover:text-white transition-colors cursor-pointer group"
                              >
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/25 group-hover:border-brand-400" />
                                {t.text}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {openPanel === 'rituals' && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[11px] text-white/40">Daily rituals</p>
                      <span className="text-[11px] font-mono text-white/40">{ritualsDone}/{RITUALS.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {RITUALS.map((r) => {
                        const done = !!state.rituals[r.id];
                        return (
                          <button
                            key={r.id}
                            onClick={() => toggleRitual(r.id)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${done ? 'border-brand-400/40 bg-brand-500/15 text-brand-300' : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white'}`}
                          >
                            {done && '✓ '}{r.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {openPanel === 'actions' && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <QuickAction icon={<Target size={14} />} label="Set focus" onClick={setFocus} />
                    <QuickAction icon={<Activity size={14} />} label="AI Physio" onClick={() => setView('physio')} />
                    <QuickAction icon={<Lightbulb size={14} />} label="Strategy" onClick={() => setView('business')} />
                    <QuickAction icon={<Sparkles size={14} />} label="Plan day" onClick={() => sendMessage('Plan my day')} />
                  </div>
                )}

                {openPanel === 'activity' && (
                  memory.recentActions.length === 0 ? (
                    <p className="text-[13px] text-white/35">No recorded actions yet this session.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {memory.recentActions.map((a, i) => (
                        <li key={i} className="flex items-center gap-2 text-[12px] text-white/60">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.ok ? 'bg-brand-400' : 'bg-red-400/70'}`} />
                          <span className="truncate">{a.summary}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-white/25">{new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The dock: collapsed entry points + the always-visible settings gear. */}
      <div className="mt-3 flex shrink-0 items-center justify-center gap-1.5 pb-1">
        <div className="liquid-glass-panel flex items-center gap-1 rounded-full px-1.5 py-1.5 overflow-x-auto">
          {DOCK.map(({ id, label, icon: Icon }) => {
            const active = openPanel === id;
            return (
              <button
                key={id}
                onClick={() => togglePanel(id)}
                aria-expanded={active}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  active ? 'bg-white/15 text-white' : 'text-white/45 hover:bg-white/[0.07] hover:text-white/85'
                }`}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
          <span className="mx-0.5 h-5 w-px bg-white/10" />
          <button
            onClick={openSettings}
            aria-label="Customize widgets & settings"
            title="Customize widgets & settings"
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/45 hover:bg-white/[0.07] hover:text-white/85 transition-all cursor-pointer"
          >
            <Sliders size={13} />
            <span className="hidden sm:inline">Customize</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, sub, tint }: { icon: React.ReactNode; label: string; value: string; sub: string; tint: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">{icon} {label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tint}`}>
        {value}
        <span className="ml-1 text-[11px] font-normal text-white/35">{sub}</span>
      </p>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[12px] font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer">
      <span className="text-brand-400">{icon}</span>
      <span className="truncate">{label}</span>
      <ArrowRight size={12} className="ml-auto text-white/25" />
    </button>
  );
}
