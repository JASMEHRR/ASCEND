/**
 * Stats — streaks and the last 30 days.
 *
 * The room streak is the one that matters socially: consecutive days where
 * *everyone* cleared. It's the mechanic that makes your miss cost your friends
 * something concrete, which is the whole premise of a shared board.
 */
import { useEffect, useState } from 'react';
import { Flame, Loader2, Puzzle, Trophy, Users } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { usePuzzle } from '../usePuzzle';
import { subscribePublicDays } from '../data/rooms';
import type { DaySummary } from '../data/schema';
import { lastNDays, weekDays } from '../logic/dates';
import { clearedDay, dailyStreak, weeklyStreak } from '../logic/streaks';
import { tilesEarnedOn } from '../logic/tiles';
import type { DayKey } from '../logic/types';

export default function ArenaStats() {
  const { room, players, habits, entries, today, streak } = useArena();
  const { canvases } = usePuzzle();
  const [others, setOthers] = useState<Record<string, (DaySummary & { day: DayKey })[]>>({});
  const [loading, setLoading] = useState(!!room);

  // Other players' summaries, for the room streak.
  useEffect(() => {
    if (!room) {
      setLoading(false);
      return;
    }
    const unsubs = players.map((p) =>
      subscribePublicDays(room.id, p.id, (days) => {
        setOthers((cur) => ({ ...cur, [p.id]: days }));
        setLoading(false);
      }),
    );
    if (players.length === 0) setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [room, players]);

  const days30 = lastNDays(30, today);

  /**
   * Consecutive days everyone cleared. Computed from the public summaries
   * rather than raw ticks, because that's all the rules let us see of anyone
   * else's board.
   */
  const roomStreakDays = (() => {
    if (!room || players.length === 0) return 0;
    const clearedOn = (day: DayKey) =>
      players.every((p) => (others[p.id] ?? []).find((d) => d.day === day)?.cleared === true);
    let n = 0;
    for (let i = days30.length - 1; i >= 0; i--) {
      const day = days30[i];
      // Today only counts once it's actually cleared; it never breaks a streak.
      if (day === today && !clearedOn(day)) continue;
      if (!clearedOn(day)) break;
      n++;
    }
    return n;
  })();

  // weeklyStreak just walks a descending, gapless id sequence — puzzle ids
  // (each window's own start day) work the same way calendar week keys did.
  const completedWeeks = new Set(canvases.filter((c) => c.complete).map((c) => c.id));
  const idsDesc = canvases.map((c) => c.id);
  const pictureStreak = weeklyStreak(completedWeeks, idsDesc);

  const weekTiles = weekDays(today).reduce((n, d) => n + tilesEarnedOn(habits, entries, d), 0);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/25" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Flame size={13} />} label="Your streak" value={`${streak}`} sub="days" tint="text-amber-400" />
        <Stat icon={<Users size={13} />} label="Room streak" value={`${roomStreakDays}`} sub="days" tint="text-brand-400" />
        <Stat icon={<Trophy size={13} />} label="Pictures" value={`${pictureStreak}`} sub="in a row" tint="text-white" />
        <Stat icon={<Puzzle size={13} />} label="This week" value={`${weekTiles}`} sub="pieces" tint="text-brand-300" />
      </div>

      {room && players.length > 1 && roomStreakDays > 0 && (
        <p className="rounded-2xl border border-brand-400/25 bg-brand-500/10 px-4 py-2.5 text-[12px] text-white/75">
          Everyone in {room.name} has cleared {roomStreakDays} {roomStreakDays === 1 ? 'day' : 'days'} running.
          Don't be the one who breaks it.
        </p>
      )}

      {/* 30-day heatmap: one square per day, brighter the more you did. */}
      <section className="space-y-2">
        <p className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">Last 30 days</p>
        <div className="flex flex-wrap gap-1">
          {days30.map((d) => {
            const earned = tilesEarnedOn(habits, entries, d);
            const total = habits.length || 1;
            const ratio = Math.min(1, earned / total);
            const full = clearedDay(habits, entries, d);
            return (
              <span
                key={d}
                title={`${d} — ${earned}/${total}`}
                className={`h-4 w-4 rounded-[4px] border ${
                  full ? 'border-brand-400/60' : 'border-white/8'
                }`}
                style={{
                  background:
                    ratio === 0 ? 'rgba(255,255,255,0.03)' : `rgba(16, 185, 129, ${0.15 + ratio * 0.6})`,
                }}
              />
            );
          })}
        </div>
        <p className="text-[10px] text-white/25">
          Only this week's ticks are loaded live, so earlier days fill in as history syncs.
        </p>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tint: string;
}) {
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
