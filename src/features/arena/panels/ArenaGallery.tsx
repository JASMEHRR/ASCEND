/**
 * The gallery: every solo picture (finished or not, current windowed ones
 * plus older calendar-week ones from before the switch) and every room game
 * this player took part in. A solo entry can be marked private, hiding it
 * from anyone but its owner — group games are always visible to the room
 * that played them, same as the room chat reveal.
 */
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Trophy, Users } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useArena } from '../ArenaContext';
import { usePuzzle } from '../usePuzzle';
import { listWeeks } from '../data/habits';
import { listGamePuzzles } from '../data/rooms';
import type { PuzzleDoc, WeekDoc } from '../data/schema';

/**
 * A legacy calendar-week canvas, reshaped to look like a PuzzleDoc for
 * display. `startsAt`/`days` are dummy values — the gallery only ever reads
 * `imageUrl`/`cols`/`rows`/`placements` off these, never the tile-balance
 * math in usePuzzle.ts, so an exact window isn't needed for a read-only view.
 */
function fromLegacyWeek(week: string, doc: WeekDoc): PuzzleDoc & { id: string } {
  return { ...doc, id: week, startsAt: week, days: 7 };
}
import PuzzleCanvas from './PuzzleCanvas';

export default function ArenaGallery() {
  const { user } = useAuth();
  const { rooms, players } = useArena();
  const { canvases, setPrivate } = usePuzzle();
  const [legacy, setLegacy] = useState<(PuzzleDoc & { id: string })[]>([]);
  const [roomGames, setRoomGames] = useState<Record<string, (PuzzleDoc & { id: string })[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      listWeeks(user.uid).then((ws) => ws.map((w) => fromLegacyWeek(w.week, w))),
      Promise.all(rooms.map((r) => listGamePuzzles(r.id).then((gs) => [r.id, gs] as const))),
    ])
      .then(([ws, gs]) => {
        setLegacy(ws);
        setRoomGames(Object.fromEntries(gs));
      })
      .finally(() => setLoading(false));
  }, [user, rooms]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/25" />
      </div>
    );
  }

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const solo = [...canvases, ...legacy.filter((w) => !canvases.some((c) => c.id === w.id))];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
          <Trophy size={11} /> Your pictures · {solo.length}
        </p>
        {solo.length === 0 && <p className="py-6 text-center text-[12px] text-white/25">Nothing yet.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {solo.map((c) => (
            <div key={c.id} className="space-y-1.5 rounded-2xl border border-white/8 bg-white/[0.03] p-2">
              <PuzzleCanvas imageUrl={c.imageUrl} cols={c.cols} rows={c.rows} aspect={c.aspect} placements={c.placements.map((p) => ({ ...p, week: c.id }))} />
              <div className="flex items-center justify-between px-0.5">
                <span className="font-mono text-[9.5px] text-white/35">
                  {c.id} · {c.placements.length}/{c.cols * c.rows}
                  {c.ended && !((c.placements.length ?? 0) >= c.cols * c.rows) ? ' · unfinished' : ''}
                </span>
                <button
                  onClick={() => void setPrivate(c.id, !c.private)}
                  aria-label={c.private ? 'Make visible' : 'Make private'}
                  className="rounded p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  {c.private ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {rooms.map((r) => {
        const games = roomGames[r.id] ?? [];
        if (games.length === 0) return null;
        return (
          <section key={r.id} className="space-y-2 border-t border-white/8 pt-4">
            <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
              <Users size={11} /> {r.name} · {games.length} {games.length === 1 ? 'game' : 'games'}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {games.map((g) => {
                const perPlayer = new Map<string, number>();
                for (const p of g.placements) {
                  if (p.playerId) perPlayer.set(p.playerId, (perPlayer.get(p.playerId) ?? 0) + 1);
                }
                return (
                  <div key={g.id} className="space-y-1.5 rounded-2xl border border-white/8 bg-white/[0.03] p-2">
                    <PuzzleCanvas
                      imageUrl={g.imageUrl}
                      cols={g.cols}
                      rows={g.rows}
                      aspect={g.aspect}
                      placements={g.placements.map((p) => ({ ...p, week: g.id }))}
                      playerNames={playerNames}
                    />
                    <span className="block px-0.5 font-mono text-[9.5px] text-white/35">
                      {new Date(g.id).toLocaleDateString()} · {g.placements.length}/{g.cols * g.rows}
                    </span>
                    <div className="flex flex-wrap gap-1 px-0.5">
                      {[...perPlayer.entries()].map(([pid, n]) => (
                        <span key={pid} className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/50">
                          {playerNames[pid] ?? 'Someone'}: {n}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
