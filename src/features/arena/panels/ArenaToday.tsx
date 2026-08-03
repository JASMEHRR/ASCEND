/**
 * Today — the daily tick surface.
 *
 * This is the screen that decides whether Arena survives past week one, so the
 * tick is one tap with no confirmation and no dialog. Everything else on the
 * page is feedback about that tap.
 */
import { Check, Flame, Lock, Minus, Plus, Puzzle, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useArena } from '../ArenaContext';
import { usePuzzle } from '../usePuzzle';
import ArenaOnboard from './ArenaOnboard';
import { isDone } from '../logic/tiles';
import type { Habit } from '../logic/types';

export default function ArenaToday({ onManualSetup }: { onManualSetup?: () => void }) {
  const { habits, entries, today, todayTiles, misses, streak, tick, untick } = useArena();
  // The real spare-tile count, counted against placements across every canvas.
  const { available } = usePuzzle();

  // An empty board is the first thing a new player sees, so it opens with the
  // conversational setup rather than an empty list and a shrug.
  if (habits.length === 0) {
    return <ArenaOnboard onManual={() => onManualSetup?.()} />;
  }

  const done = habits.filter((h) => isDone(h, entries, today)).length;

  return (
    <div className="space-y-4">
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
          <HabitRow key={h.id} habit={h} done={isDone(h, entries, today)} onTick={tick} onUntick={untick} entries={entries} today={today} />
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
}: {
  habit: Habit;
  done: boolean;
  onTick: (h: Habit, v: number) => Promise<void>;
  onUntick: (h: Habit) => Promise<void>;
  entries: { habitId: string; day: string; value: number }[];
  today: string;
}) {
  const target = habit.target && habit.target > 0 ? habit.target : 1;
  const current = entries.find((e) => e.habitId === habit.id && e.day === today)?.value ?? 0;
  const isCounter = target > 1;

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

      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${done ? 'text-white/50 line-through' : 'text-white/90'}`}>
          <span className="truncate">{habit.label}</span>
          {habit.private && <Lock size={11} className="shrink-0 text-white/30" aria-label="Name hidden from the room" />}
        </span>
        {isCounter && (
          <span className="mt-0.5 block font-mono text-[10.5px] text-white/35">
            {current}/{target} {habit.unit ?? ''}
          </span>
        )}
      </span>

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
