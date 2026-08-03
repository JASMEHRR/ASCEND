/**
 * Room chat.
 *
 * Tile placements arrive as one rolling batched message per player per day
 * (see rooms.ts::postBatch) rather than one per habit — six people ticking
 * eight habits would otherwise be fifty messages nobody reads.
 */
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { sendMessage } from '../data/rooms';
import { useAuth } from '../../../context/AuthContext';

export default function ArenaChat() {
  const { room, messages, players } = useArena();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const nameFor = (playerId: string | null) =>
    playerId ? (players.find((p) => p.id === playerId)?.name ?? 'Someone') : null;

  const send = async () => {
    const body = text.trim();
    if (!body || !room || !user) return;
    setText('');
    await sendMessage(room.id, user.uid, body);
  };

  return (
    <div className="flex h-full min-h-[320px] flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
        {messages.length === 0 && (
          <p className="py-8 text-center text-[12px] text-white/25">Nothing yet. Tick a habit and the room will hear about it.</p>
        )}
        {messages.map((m) => {
          const mine = m.playerId === user?.uid;
          // Batched placements and milestones read as system lines, not chat.
          if (m.kind !== 'text') {
            return (
              <p key={m.id} className="py-0.5 text-center font-mono text-[10.5px] uppercase tracking-wider text-white/30">
                {m.body}
              </p>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                  mine ? 'bg-brand-500 text-black' : 'border border-white/10 bg-white/[0.06] text-white/85'
                }`}
              >
                {!mine && (
                  <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-white/40">
                    {nameFor(m.playerId)}
                  </span>
                )}
                <span className="text-[13px] leading-snug">{m.body}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Say something to the room…"
          className="liquid-glass-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          aria-label="Send"
          className="shrink-0 rounded-xl bg-brand-500 p-3 text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
