/**
 * The board — who showed up this week.
 *
 * Reads every other player's `public/day_*` summaries, never their raw ticks:
 * the rules deny those, and it's also the point. You see that someone cleared
 * six of eight, not which six.
 */
import { useEffect, useState } from 'react';
import { Flame, Puzzle, Loader2 } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { subscribePublicDays } from '../data/rooms';
import type { DaySummary } from '../data/schema';
import { weekDays } from '../logic/dates';
import type { DayKey, Player } from '../logic/types';

type Row = { player: Player; tiles: number; cleared: number; today: DaySummary | null };

export default function ArenaLeaderboard() {
  const { room, players, today } = useArena();
  const [summaries, setSummaries] = useState<Record<string, (DaySummary & { day: DayKey })[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!room) return;
    setLoading(true);
    const unsubs = players.map((p) =>
      subscribePublicDays(room.id, p.id, (days) => {
        setSummaries((cur) => ({ ...cur, [p.id]: days }));
        setLoading(false);
      }),
    );
    if (players.length === 0) setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [room, players]);

  const week = weekDays(today);
  const rows: Row[] = players
    .map((player) => {
      const days = (summaries[player.id] ?? []).filter((d) => week.includes(d.day));
      return {
        player,
        tiles: days.reduce((n, d) => n + d.earned, 0),
        cleared: days.filter((d) => d.cleared).length,
        today: days.find((d) => d.day === today) ?? null,
      };
    })
    .sort((a, b) => b.tiles - a.tiles);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/25" />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="px-1 pb-1 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/35">
        This week · pieces placed
      </p>
      {rows.map((row, i) => (
        <div
          key={row.player.id}
          className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3"
        >
          <span
            className={`w-5 shrink-0 text-center font-mono text-[12px] font-extrabold ${
              i === 0 ? 'text-amber-400' : i === 1 ? 'text-white/70' : i === 2 ? 'text-amber-700' : 'text-white/25'
            }`}
          >
            {i + 1}
          </span>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-[12px] font-bold uppercase text-brand-300">
            {row.player.name.charAt(0)}
          </div>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-white/90">{row.player.name}</span>
            <span className="block font-mono text-[10px] text-white/35">
              {row.today ? `${row.today.earned}/${row.today.total} today` : 'nothing logged today'}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-white/45">
            <Flame size={11} className="text-amber-400/70" /> {row.cleared}
          </span>
          <span className="flex w-14 shrink-0 items-center justify-end gap-1.5 text-[15px] font-extrabold text-brand-300">
            <Puzzle size={13} className="text-brand-400/60" />
            {row.tiles}
          </span>
        </div>
      ))}
    </div>
  );
}
