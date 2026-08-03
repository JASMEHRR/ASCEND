/**
 * The empty state: create a room or join one by code.
 *
 * Arena is meaningless alone, so this is the only screen shown until the
 * player belongs to a room.
 */
import { useState } from 'react';
import { Loader2, Plus, Users } from 'lucide-react';
import { useArena } from '../ArenaContext';

export default function ArenaJoin({
  onDone,
  canCancel,
}: {
  onDone?: () => void;
  canCancel?: boolean;
} = {}) {
  const { createRoom, joinRoom } = useArena();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'create' | 'join', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-[320px] w-full max-w-md flex-col justify-center gap-5">
      <div className="text-center">
        <h2 className="text-xl font-extrabold tracking-tight text-white">Arena</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-white/45">
          A shared board. Everyone keeps their own habits; the room sees who showed up.
        </p>
      </div>

      <div className="liquid-glass-panel space-y-2.5 rounded-3xl p-5">
        <label className="block font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
          Start a room
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Room name"
            className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <button
            onClick={() => run('create', () => createRoom(name.trim() || 'My Room'))}
            disabled={busy !== null}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2.5 text-[12px] font-bold text-black transition-all hover:bg-brand-400 disabled:opacity-50 cursor-pointer"
          >
            {busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create
          </button>
        </div>
      </div>

      <div className="liquid-glass-panel space-y-2.5 rounded-3xl p-5">
        <label className="block font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
          Join with a code
        </label>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3.5 py-2.5 font-mono text-[13px] tracking-[0.2em] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <button
            onClick={() => run('join', () => joinRoom(code.trim()))}
            disabled={busy !== null || code.trim().length < 6}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-[12px] font-bold text-white/85 transition-all hover:bg-white/[0.12] disabled:opacity-40 cursor-pointer"
          >
            {busy === 'join' ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            Join
          </button>
        </div>
      </div>

      {error && <p className="text-center text-[12px] text-red-400/90">{error}</p>}

      {canCancel && (
        <button
          onClick={onDone}
          className="mx-auto text-[11.5px] font-semibold text-white/40 transition-colors hover:text-white/80 cursor-pointer"
        >
          Back to my board
        </button>
      )}
    </div>
  );
}
