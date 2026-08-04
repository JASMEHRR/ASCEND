/**
 * Arena settings — habits, privacy, and the room itself.
 */
import { useState } from 'react';
import { Copy, Lock, LogOut, Plus, Trash2, Unlock, XCircle } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { useDialog } from '../../../context/DialogContext';
import { useToast } from '../../../context/ToastContext';
import { REMOVAL_PENALTY_TILES } from '../logic/tiles';

export default function ArenaSettings() {
  const {
    room,
    habits,
    addHabit,
    removeHabit,
    deleteHabit,
    setPrivacy,
    setAllPrivacy,
    leaveRoom,
    deleteRoom,
    isRoomOwner,
    setPuzzleMode,
  } = useArena();
  const { confirm } = useDialog();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');

  const allPrivate = habits.length > 0 && habits.every((h) => h.private);

  const add = async () => {
    const name = label.trim();
    if (!name) return;
    const n = Number(target);
    setLabel('');
    setTarget('');
    await addHabit({
      label: name,
      kind: 'good',
      icon: 'check',
      color: '#10b981',
      ...(n > 1 ? { target: n } : {}),
    });
    toast.show({ message: `"${name}" starts counting tomorrow.` });
  };

  /**
   * Soft remove: the habit keeps showing and keeps counting through the rest
   * of this week — it does NOT disappear immediately, that's the point. It
   * drops off on its own once the week ends, and the following picture grows
   * by REMOVAL_PENALTY_TILES as the cost of dropping it.
   */
  const remove = async (habitId: string, name: string) => {
    const ok = await confirm({
      title: `Wind down "${name}"?`,
      message: `It keeps counting until the week ends, then it's gone — this doesn't remove it right now. Next week's picture grows by ${REMOVAL_PENALTY_TILES} pieces, the cost of dropping a habit. Added it by mistake? Use "Delete outright" instead.`,
      confirmLabel: 'Wind down',
      danger: true,
    });
    if (ok) await removeHabit(habitId);
  };

  /** Hard delete: gone immediately, no penalty, no trace. For mistakes only. */
  const deleteOutright = async (habitId: string, name: string) => {
    const ok = await confirm({
      title: `Delete "${name}" outright?`,
      message: 'Removes it immediately with no penalty and no history — only for habits added by mistake.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await deleteHabit(habitId);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <p className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">Add a habit</p>
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="e.g. Read 30 minutes"
            className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))}
            placeholder="reps"
            className="liquid-glass-input w-20 shrink-0 rounded-xl px-3 py-2.5 text-center text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <button
            onClick={add}
            disabled={!label.trim()}
            className="shrink-0 rounded-xl bg-brand-500 p-2.5 text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
            aria-label="Add habit"
          >
            <Plus size={16} />
          </button>
        </div>
        <p className="text-[10.5px] leading-snug text-white/30">
          New habits start tomorrow, and the pieces they earn are spare — use them on this week or to repair an
          older picture.
        </p>
      </section>

      <section className="space-y-2 border-t border-white/8 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
            Your habits · {habits.length}
          </p>
          {habits.length > 0 && (
            <button
              onClick={() => setAllPrivacy(!allPrivate)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] font-semibold text-white/50 transition-all hover:border-white/20 hover:text-white/85 cursor-pointer"
            >
              {allPrivate ? <Unlock size={11} /> : <Lock size={11} />}
              {allPrivate ? 'Show all names' : 'Hide all names'}
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {habits.map((h) => (
            <div key={h.id} className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-white/85">{h.label}</span>
                <span className="block font-mono text-[10px] text-white/30">
                  {h.private ? 'Name hidden from the room' : 'Visible to the room'}
                  {h.target && h.target > 1 ? ` · ${h.target} ${h.unit ?? 'reps'}` : ''}
                </span>
              </span>
              <button
                onClick={() => setPrivacy(h.id, !h.private)}
                aria-label={h.private ? `Show ${h.label} to the room` : `Hide ${h.label} from the room`}
                className={`rounded-lg p-2 transition-colors cursor-pointer hover:bg-white/10 ${
                  h.private ? 'text-brand-400/80' : 'text-white/35 hover:text-white/70'
                }`}
              >
                {h.private ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <button
                onClick={() => remove(h.id, h.label)}
                aria-label={`Wind down ${h.label} — keeps counting until the week ends`}
                title="Wind down — keeps counting until the week ends, then drops off"
                className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/10 hover:text-amber-400 cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => deleteOutright(h.id, h.label)}
                aria-label={`Delete ${h.label} outright — added by mistake`}
                title="Delete outright — added by mistake, no penalty"
                className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/10 hover:text-red-400 cursor-pointer"
              >
                <XCircle size={13} />
              </button>
            </div>
          ))}
          {habits.length === 0 && <p className="py-4 text-center text-[12px] text-white/25">No habits yet.</p>}
        </div>
      </section>

      {room && (
        <section className="space-y-2 border-t border-white/8 pt-4">
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">Room</p>
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-white/85">{room.name}</span>
              <span className="block font-mono text-[11px] tracking-[0.2em] text-brand-300">{room.code}</span>
            </span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(room.code);
                toast.show({ message: 'Invite code copied.' });
              }}
              aria-label="Copy invite code"
              className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <Copy size={13} />
            </button>
          </div>

          {isRoomOwner && (
            <div className="space-y-1.5">
              <p className="text-[10.5px] leading-snug text-white/30">
                Puzzle mode. Shared turns on a room-wide competition in the Puzzle tab: set a length, everyone
                readies up, then you start it together. Solo puzzles keep running either way — switching back
                just hides the room game, it doesn't erase it.
              </p>
              <div className="flex gap-2">
                {(['solo', 'shared'] as const).map((mode) => {
                  const active = (room.puzzleMode ?? 'solo') === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setPuzzleMode(mode)}
                      className={`flex-1 rounded-xl border py-2 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        active
                          ? 'border-brand-400/40 bg-brand-500/15 text-white'
                          : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white/85 hover:border-white/20'
                      }`}
                    >
                      {mode === 'solo' ? 'Solo' : 'Shared'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'Leave this room?',
                  message: 'Your habits, streak and pictures stay with you — you just leave the leaderboard.',
                  confirmLabel: 'Leave',
                  danger: true,
                });
                if (ok) await leaveRoom();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/50 transition-all hover:border-red-400/30 hover:text-red-400 cursor-pointer"
            >
              <LogOut size={13} /> Leave
            </button>
            {/* Only the creator can delete, matching the security rules. */}
            {isRoomOwner && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete "${room.name}"?`,
                    message:
                      "This erases the room for everyone in it — habits, history, pictures and chat. It can't be undone.",
                    confirmLabel: 'Delete room',
                    danger: true,
                  });
                  if (ok) await deleteRoom();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 py-2.5 text-[11px] font-bold uppercase tracking-wider text-red-400/80 transition-all hover:border-red-400/40 hover:text-red-400 cursor-pointer"
              >
                <Trash2 size={13} /> Delete room
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
