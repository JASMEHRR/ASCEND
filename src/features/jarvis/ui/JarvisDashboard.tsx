import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Flame, Target, Droplets, Zap, Activity, Lightbulb, Plus, Check, ArrowRight } from 'lucide-react';
import type { OSState } from '../../../types';
import { RITUALS } from '../../../constants';
import { useAuth } from '../../../context/AuthContext';
import { useDialog } from '../../../context/DialogContext';
import { disciplineScore } from '../../../lib/discipline';
import { effectiveStreak } from '../../../hooks/useStreak';
import Panel from '../../../components/ui/Panel';
import { useJarvis } from '../engine/JarvisProvider';
import type { View } from '../context/appContext';
import JarvisConsole from './JarvisConsole';
import RemindersPanel from '../../reminders/RemindersPanel';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  setView: (v: View) => void;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Working late';
}

/** Live status ring around the Jarvis mark. */
function StatusOrb() {
  const { thinking, voice } = useJarvis();
  const active = thinking || voice.listening || voice.speaking;
  const label = voice.listening ? 'Listening' : thinking ? 'Thinking' : voice.speaking ? 'Speaking' : 'Online';
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-11 w-11 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border border-brand-400/40"
          animate={active ? { scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] } : { opacity: 0.25 }}
          transition={active ? { repeat: Infinity, duration: 1.4 } : {}}
        />
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-brand-400/30 bg-brand-500/15 backdrop-blur-xl">
          <motion.div animate={thinking ? { rotate: 360 } : { scale: [1, 1.1, 1] }} transition={thinking ? { repeat: Infinity, duration: 1.2, ease: 'linear' } : { repeat: Infinity, duration: 3 }} className="text-brand-400">
            <Sparkles size={18} />
          </motion.div>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-mono font-black uppercase tracking-[0.25em] text-brand-400">Jarvis</p>
        <p className="flex items-center gap-1.5 text-[11px] text-white/50">
          <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-brand-400 animate-pulse' : 'bg-white/40'}`} />
          {label}
        </p>
      </div>
    </div>
  );
}

const SUGGESTIONS = ['Plan my day', 'How am I doing?', "What should I focus on?", 'Give me a daily briefing'];

export default function JarvisDashboard({ state, updateState, setView }: Props) {
  const { user } = useAuth();
  const { prompt } = useDialog();
  const { sendMessage, memory } = useJarvis();

  const score = disciplineScore(state);
  const streak = effectiveStreak(state);
  const ritualsDone = Object.values(state.rituals).filter(Boolean).length;
  const openTasks = state.tasks.filter((t) => !t.done).length;
  const name = (user?.email ?? 'there').split('@')[0];

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

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Hero */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {greeting()}, <span className="capitalize">{name}</span>.
          </h2>
          <p className="mt-1 text-[13px] text-white/45">{briefing}</p>
        </div>
        <StatusOrb />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* Primary: the AI console */}
        <Panel className="flex min-h-[26rem] flex-col lg:min-h-[30rem]">
          <div className="mb-3 flex flex-wrap gap-2">
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
          <div className="flex-1 min-h-0">
            <JarvisConsole autoFocus />
          </div>
        </Panel>

        {/* Orbiting intelligent cards */}
        <div className="flex flex-col gap-4">
          {/* Current focus */}
          <Panel accent={!!state.primaryObjective && !state.primaryObjective.done}>
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
          </Panel>

          {/* Metrics */}
          <Panel>
            <div className="grid grid-cols-2 gap-4">
              <Metric icon={<Zap size={13} />} label="Discipline" value={`${score}`} sub="/100" tint="text-white" />
              <Metric icon={<Flame size={13} />} label="Streak" value={`${streak}`} sub="days" tint="text-amber-400" />
              <Metric icon={<Sparkles size={13} />} label="XP" value={`${state.points ?? 0}`} sub="pts" tint="text-brand-400" />
              <Metric icon={<Droplets size={13} />} label="Water" value={`${state.water}`} sub="glasses" tint="text-sky-400" />
            </div>
            <button onClick={addWater} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer">
              <Droplets size={12} /> Log a glass
            </button>
          </Panel>

          {/* Reminders */}
          <RemindersPanel />

          {/* Quick actions */}
          <Panel>
            <p className="mb-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Quick actions</p>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction icon={<Target size={14} />} label="Set focus" onClick={setFocus} />
              <QuickAction icon={<Activity size={14} />} label="AI Physio" onClick={() => setView('physio')} />
              <QuickAction icon={<Lightbulb size={14} />} label="Strategy" onClick={() => setView('business')} />
              <QuickAction icon={<Sparkles size={14} />} label="Plan day" onClick={() => sendMessage('Plan my day')} />
            </div>
          </Panel>

          {/* Recent memory */}
          {memory.recentActions.length > 0 && (
            <Panel>
              <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Recent activity</p>
              <ul className="space-y-1.5">
                {memory.recentActions.slice(0, 4).map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px] text-white/60">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.ok ? 'bg-brand-400' : 'bg-red-400/70'}`} />
                    <span className="truncate">{a.summary}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {/* Compact today strip: rituals + tasks (glanceable, still interactive) */}
      <div className="grid gap-5 md:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Today's rituals</p>
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
        </Panel>

        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Open tasks</p>
            <button onClick={() => sendMessage('add a task')} className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 cursor-pointer">
              <Plus size={12} /> Ask Jarvis
            </button>
          </div>
          {openTasks === 0 ? (
            <p className="text-[13px] text-white/35">Nothing pending. Tell Jarvis what to add.</p>
          ) : (
            <ul className="space-y-1.5">
              {state.tasks.filter((t) => !t.done).slice(0, 6).map((t) => (
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
        </Panel>
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
