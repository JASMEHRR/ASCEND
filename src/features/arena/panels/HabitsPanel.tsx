/**
 * Arena habits, rendered inside the dashboard's panel dock.
 *
 * The old Rituals panel toggled a hardcoded list stored in OSState. This reads
 * and writes the same Arena habits as the Today tab, so ticking here moves the
 * leaderboard and the weekly picture too — one source of truth for "did I show
 * up today", instead of a dashboard score that disagreed with the board.
 */
import { ArrowRight, Lock, Puzzle } from 'lucide-react';
import { useArenaOptional } from '../ArenaContext';
import { isDone } from '../logic/tiles';

export default function HabitsPanel({ onOpenArena }: { onOpenArena: () => void }) {
  const arena = useArenaOptional();

  if (!arena || arena.habits.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 py-1">
        <p className="text-[12px] text-white/45">No habits yet.</p>
        <button
          onClick={onOpenArena}
          className="flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-400 transition-colors hover:text-brand-300 cursor-pointer"
        >
          Set them up in Arena <ArrowRight size={12} />
        </button>
      </div>
    );
  }

  const { habits, entries, today, todayTiles, tick, untick } = arena;
  const done = habits.filter((h) => isDone(h, entries, today)).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] text-white/40">Today's habits</p>
        <span className="flex items-center gap-2 font-mono text-[11px] text-white/40">
          <span className="flex items-center gap-1 text-brand-300">
            <Puzzle size={11} /> {todayTiles}
          </span>
          {done}/{habits.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {habits.map((h) => {
          const isOn = isDone(h, entries, today);
          const target = h.target && h.target > 0 ? h.target : 1;
          return (
            <button
              key={h.id}
              onClick={() => (isOn ? untick(h) : tick(h, target))}
              aria-pressed={isOn}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
                isOn
                  ? 'border-brand-400/40 bg-brand-500/15 text-brand-300'
                  : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white'
              }`}
            >
              {isOn && '✓ '}
              {h.label}
              {h.private && <Lock size={9} className="text-white/30" />}
            </button>
          );
        })}
      </div>
      <button
        onClick={onOpenArena}
        className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-white/35 transition-colors hover:text-brand-300 cursor-pointer"
      >
        Open Arena <ArrowRight size={11} />
      </button>
    </div>
  );
}
