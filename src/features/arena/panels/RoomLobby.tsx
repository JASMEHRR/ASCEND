/**
 * The room game lobby: owner sets a duration, everyone readies up, owner
 * starts. Only shown for 'shared' rooms — solo puzzles need none of this.
 */
import { useState } from 'react';
import { Check, Clock, Play, Users } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { useRoomGame } from '../useRoomGame';

export default function RoomLobby() {
  const { isRoomOwner, players } = useArena();
  const { game, readyCount, totalMembers, allReady, iAmReady, configure, toggleReady, start, endNow } = useRoomGame();
  const [days, setDays] = useState(String(game?.durationDays ?? 7));

  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <div className="text-center">
        <Users size={28} className="mx-auto text-white/20" />
        <h3 className="mt-3 text-[15px] font-bold text-white">Room lobby</h3>
        <p className="mt-1 text-[12px] leading-snug text-white/40">
          Everyone readies up, then the owner starts the game. No stockpiled pieces carry in — only what you earn
          from here counts.
        </p>
      </div>

      <div className="liquid-glass-panel space-y-3 rounded-3xl p-5">
        {isRoomOwner && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
              <Clock size={11} /> Game length
            </label>
            <div className="flex gap-2">
              <input
                value={days}
                onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
                onBlur={() => days.trim() && void configure(Math.max(1, Number(days)))}
                placeholder="days"
                className="liquid-glass-input w-24 rounded-xl px-3 py-2.5 text-center text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
              />
              <span className="flex items-center text-[12px] text-white/40">days</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
          <span className="text-[12.5px] text-white/70">
            <span className="font-bold text-white">{readyCount}</span> / {totalMembers} ready
          </span>
          <button
            onClick={() => void toggleReady()}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold transition-all cursor-pointer ${
              iAmReady ? 'bg-brand-500 text-black hover:bg-brand-400' : 'border border-white/12 bg-white/[0.04] text-white/70 hover:bg-white/[0.1]'
            }`}
          >
            <Check size={13} /> {iAmReady ? "I'm ready" : 'Ready up'}
          </button>
        </div>

        {players.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {players.map((p) => (
              <span
                key={p.id}
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
                  game?.ready?.[p.id] ? 'bg-brand-500/20 text-brand-300' : 'bg-white/[0.04] text-white/35'
                }`}
              >
                {p.name}
              </span>
            ))}
          </div>
        )}

        {isRoomOwner && (
          <button
            onClick={() => void start()}
            disabled={!allReady || !game?.durationDays}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-[12px] font-bold text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
          >
            <Play size={14} /> Start the game
          </button>
        )}
        {!isRoomOwner && (
          <p className="text-center text-[11px] text-white/30">Waiting on the room owner to start.</p>
        )}
        {game?.status === 'active' && isRoomOwner && (
          <button
            onClick={() => void endNow()}
            className="w-full rounded-xl border border-red-400/20 bg-red-500/10 py-2 text-[11px] font-bold text-red-400/80 transition-all hover:border-red-400/40 cursor-pointer"
          >
            End game now
          </button>
        )}
      </div>
    </div>
  );
}
