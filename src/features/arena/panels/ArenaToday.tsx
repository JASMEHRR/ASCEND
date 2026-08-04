/**
 * Today — the daily tick surface.
 *
 * This is the screen that decides whether Arena survives past week one, so the
 * tick is one tap with no confirmation and no dialog. Everything else on the
 * page is feedback about that tap.
 */
import { useState } from 'react';
import { Check, Flame, Lock, Minus, Pencil, Plus, Puzzle, Trash2, TriangleAlert, Unlock, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useArena } from '../ArenaContext';
import { useDialog } from '../../../context/DialogContext';
import { usePuzzle } from '../usePuzzle';
import ArenaOnboard from './ArenaOnboard';
import { isDone, REMOVAL_PENALTY_TILES } from '../logic/tiles';
import type { Habit } from '../logic/types';
import type { OSState } from '../../../types';

export default function ArenaToday({
  onManualSetup,
  state,
  updateState,
}: {
  onManualSetup?: () => void;
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}) {
  const { habits, entries, today, todayTiles, misses, streak, tick, untick, updateHabit, removeHabit, deleteHabit, setPrivacy } = useArena();
  const { confirm } = useDialog();
  // The real spare-tile count, counted against placements across every canvas.
  const { available } = usePuzzle();
  const adjustWishes = (delta: number) => updateState((p) => ({ ...p, wishes: Math.max(0, (p.wishes ?? 0) + delta) }));

  // An empty board is the first thing a new player sees, so it opens with the
  // conversational setup rather than an empty list and a shrug.
  if (habits.length === 0) {
    return <ArenaOnboard onManual={() => onManualSetup?.()} />;
  }

  const done = habits.filter((h) => isDone(h, entries, today)).length;

  return (
    <div className="space-y-4">
      {/* An inside joke, not a feature — plain count, no progress bar. */}
      {(state.showWishes ?? true) && (
        <div className="flex items-center justify-end gap-1 text-[11px] text-white/30">
          <button onClick={() => adjustWishes(-1)} aria-label="Decrease wishes" className="rounded p-0.5 hover:text-white/60 cursor-pointer">
            <Minus size={10} />
          </button>
          <span>{state.wishes ?? 0} wishes</span>
          <button onClick={() => adjustWishes(1)} aria-label="Increase wishes" className="rounded p-0.5 hover:text-white/60 cursor-pointer">
            <Plus size={10} />
          </button>
        </div>
      )}

      {/* The day at a glance. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Puzzle size={13} />} label="Pieces today" value={`${todayTiles}`} tint="text-brand-400" />
        <Stat icon={<Check size={13} />} label="Done" value={`${done}/${habits.length}`} tint="text-white" />
        <Stat icon={<Flame size={13} />} label="Streak" value={`${streak}`} sub="days" tint="text-amber-400" />
        <Stat
          icon={<TriangleAlert size={13} />}
          label="Misses left"
          value={`${misses.remaining}`}
          sub={misses.overBudget > 0 ? `${misses.overBudget} over` : 'this week'}
          tint={misses.remaining === 0 ? 'text-red-400' : 'text-white'}
        />
      </div>

      {available > 0 && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-brand-400/25 bg-brand-500/10 px-4 py-2.5">
          <Puzzle size={14} className="shrink-0 text-brand-400" />
          <p className="text-[12px] text-white/75">
            <span className="font-bold text-brand-300">{available}</span> spare{' '}
            {available === 1 ? 'piece' : 'pieces'} — place them on this week, or go back and repair an old one.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {habits.map((h) => (
          <HabitRow
            key={h.id}
            habit={h}
            done={isDone(h, entries, today)}
            onTick={tick}
            onUntick={untick}
            entries={entries}
            today={today}
            updateHabit={updateHabit}
            removeHabit={removeHabit}
            deleteHabit={deleteHabit}
            setPrivacy={setPrivacy}
            confirm={confirm}
          />
        ))}
      </div>
    </div>
  );
}

function HabitRow({
  habit,
  done,
  onTick,
  onUntick,
  entries,
  today,
  updateHabit,
  removeHabit,
  deleteHabit,
  setPrivacy,
  confirm,
}: {
  habit: Habit;
  done: boolean;
  onTick: (h: Habit, v: number) => Promise<void>;
  onUntick: (h: Habit) => Promise<void>;
  entries: { habitId: string; day: string; value: number }[];
  today: string;
  updateHabit: (habitId: string, fields: Partial<Habit>) => Promise<void>;
  removeHabit: (habitId: string) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
  setPrivacy: (habitId: string, isPrivate: boolean) => Promise<void>;
  confirm: (options: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;
}) {
  const target = habit.target && habit.target > 0 ? habit.target : 1;
  const current = entries.find((e) => e.habitId === habit.id && e.day === today)?.value ?? 0;
  const isCounter = target > 1;

  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(habit.label);
  const [draftTarget, setDraftTarget] = useState(habit.target ? String(habit.target) : '');
  const [draftUnit, setDraftUnit] = useState(habit.unit ?? '');

  const openEdit = () => {
    setDraftLabel(habit.label);
    setDraftTarget(habit.target ? String(habit.target) : '');
    setDraftUnit(habit.unit ?? '');
    setEditing(true);
  };

  const save = async () => {
    const label = draftLabel.trim();
    if (!label) return setEditing(false);
    const n = Number(draftTarget);
    await updateHabit(habit.id, {
      label,
      ...(n > 1 ? { target: n, unit: draftUnit.trim() || undefined } : { target: undefined, unit: undefined }),
    });
    setEditing(false);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove "${habit.label}"?`,
      message: `It keeps counting until the week ends. Next week's picture grows by ${REMOVAL_PENALTY_TILES} pieces — that's the cost of dropping a habit.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) await removeHabit(habit.id);
  };

  const deleteMistake = async () => {
    const ok = await confirm({
      title: `Delete "${habit.label}"?`,
      message: 'Added this by mistake? This removes it outright with no penalty.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await deleteHabit(habit.id);
  };

  if (editing) {
    return (
      <div className="space-y-2 rounded-2xl border border-brand-400/25 bg-brand-500/5 px-3.5 py-3">
        <div className="flex gap-2">
          <input
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-[13px] text-white outline-none focus:border-brand-500/50"
          />
          <button onClick={save} aria-label="Save" className="rounded-lg p-2 text-brand-400 hover:bg-white/10 cursor-pointer">
            <Check size={14} />
          </button>
          <button onClick={() => setEditing(false)} aria-label="Cancel" className="rounded-lg p-2 text-white/40 hover:bg-white/10 cursor-pointer">
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draftTarget}
            onChange={(e) => setDraftTarget(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="target"
            className="liquid-glass-input w-20 rounded-xl px-2.5 py-1.5 text-center text-[12px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <input
            value={draftUnit}
            onChange={(e) => setDraftUnit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="unit"
            className="liquid-glass-input w-24 rounded-xl px-2.5 py-1.5 text-center text-[12px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <button
            onClick={() => setPrivacy(habit.id, !habit.private)}
            aria-label={habit.private ? `Show ${habit.label} to the room` : `Hide ${habit.label} from the room`}
            className={`rounded-lg p-1.5 transition-colors cursor-pointer hover:bg-white/10 ${
              habit.private ? 'text-brand-400/80' : 'text-white/35 hover:text-white/70'
            }`}
          >
            {habit.private ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button onClick={remove} className="rounded-lg p-1.5 text-white/30 hover:bg-white/10 hover:text-red-400 cursor-pointer" aria-label={`Remove ${habit.label}`}>
            <Trash2 size={13} />
          </button>
          <button onClick={deleteMistake} className="text-[10.5px] text-white/30 hover:text-red-400/80 cursor-pointer">
            Added by mistake?
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all ${
        done ? 'border-brand-400/30 bg-brand-500/10' : 'border-white/8 bg-white/[0.03]'
      }`}
    >
      {/* One tap = one piece. Counters step up instead of completing outright. */}
      <button
        onClick={() => (done ? onUntick(habit) : onTick(habit, isCounter ? Math.min(current + 1, target) : 1))}
        aria-pressed={done}
        aria-label={done ? `Clear ${habit.label}` : `Mark ${habit.label} done`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
          done ? 'border-brand-400 bg-brand-400 text-black' : 'border-white/25 hover:border-white/50'
        }`}
      >
        {done && (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Check size={14} strokeWidth={4} />
          </motion.span>
        )}
      </button>

      <button onClick={openEdit} className="min-w-0 flex-1 text-left cursor-text" aria-label={`Edit ${habit.label}`}>
        <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${done ? 'text-white/50 line-through' : 'text-white/90'}`}>
          <span className="truncate">{habit.label}</span>
          {habit.private && <Lock size={11} className="shrink-0 text-white/30" aria-label="Name hidden from the room" />}
        </span>
        {isCounter && (
          <span className="mt-0.5 block font-mono text-[10.5px] text-white/35">
            {current}/{target} {habit.unit ?? ''}
          </span>
        )}
      </button>

      {isCounter && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onTick(habit, Math.max(0, current - 1))}
            aria-label={`Decrease ${habit.label}`}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => onTick(habit, current + 1)}
            aria-label={`Increase ${habit.label}`}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </div>
      )}

      <button onClick={openEdit} aria-label={`Edit ${habit.label}`} className="shrink-0 rounded-lg p-1.5 text-white/30 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
        <Pencil size={13} />
      </button>
    </div>
  );
}

function Stat({ icon, label, value, sub, tint }: { icon: React.ReactNode; label: string; value: string; sub?: string; tint: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
        {icon} {label}
      </p>
      <p className={`mt-1 text-xl font-extrabold ${tint}`}>
        {value}
        {sub && <span className="ml-1 text-[10px] font-normal text-white/35">{sub}</span>}
      </p>
    </div>
  );
}
