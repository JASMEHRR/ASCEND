/**
 * Today — the daily tick surface.
 *
 * This is the screen that decides whether Arena survives past week one, so the
 * tick is one tap with no confirmation and no dialog. Everything else on the
 * page is feedback about that tap.
 */
import { useState } from 'react';
import { Check, ChevronDown, Flame, Lock, Minus, Pencil, Plus, Puzzle, ShieldCheck, Trash2, TriangleAlert, Unlock, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useArena } from '../ArenaContext';
import { useDialog } from '../../../context/DialogContext';
import { usePuzzle } from '../usePuzzle';
import ArenaOnboard from './ArenaOnboard';
import { activeHabits, isDone, isHabitActiveOn, REMOVAL_PENALTY_TILES } from '../logic/tiles';
import { groupBySlot, slotOf, SLOTS } from '../logic/slots';
import { stepFor, stepped } from '../logic/counters';
import { habitIcon } from '../icons';
import type { Habit } from '../logic/types';
import type { OSState } from '../../../types';

const COLLAPSE_KEY = 'arena.collapsedSlots';

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

  // Nineteen habits is over a thousand pixels of scrolling on a phone. Folding
  // away the parts of the day you've finished keeps the part you're in on
  // screen. Remembered per device, so it survives a reload — and it is only a
  // convenience, so a browser that refuses storage just gets everything open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const toggleSlot = (id: string) =>
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* storage refused; the fold just won't persist */
      }
      return next;
    });

  // An empty board is the first thing a new player sees, so it opens with the
  // conversational setup rather than an empty list and a shrug.
  if (habits.length === 0) {
    return <ArenaOnboard onManual={() => onManualSetup?.()} />;
  }

  // Counted against what's actually live today: a habit that starts tomorrow
  // earns nothing if ticked, so reporting it as part of "0/19" overstates the
  // day's work and makes the number untrustworthy on the one screen that has
  // to be trusted.
  const live = activeHabits(habits, today);
  const done = live.filter((h) => isDone(h, entries, today)).length;

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
      {/* One row on a phone, not two: this sits between you and the habits, and
          you opened the screen to tick things, not to read four numbers. */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        <Stat icon={<Puzzle size={13} />} label="Pieces today" short="Pieces" value={`${todayTiles}`} tint="text-brand-400" />
        <Stat icon={<Check size={13} />} label="Done" short="Done" value={`${done}/${live.length}`} tint="text-white" />
        <Stat icon={<Flame size={13} />} label="Streak" short="Streak" value={`${streak}`} sub="days" tint="text-amber-400" />
        <Stat
          icon={<TriangleAlert size={13} />}
          label="Misses left"
          short="Misses"
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

      <div className="space-y-5">
        {groupBySlot(habits).map((group) => {
          const liveInGroup = group.habits.filter((h) => isHabitActiveOn(h, today));
          const cleared = liveInGroup.filter((h) => isDone(h, entries, today)).length;
          const isShut = !!collapsed[group.slot.id];
          return (
            <section key={group.slot.id} className="space-y-1.5">
              <button
                onClick={() => toggleSlot(group.slot.id)}
                aria-expanded={!isShut}
                aria-label={`${isShut ? 'Expand' : 'Collapse'} ${group.slot.label}`}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/[0.04] cursor-pointer"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: group.slot.color }} />
                <h3 className="font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/45">
                  {group.slot.label}
                </h3>
                <span className="hidden truncate text-[9.5px] text-white/25 sm:inline">{group.slot.hint}</span>
                <span className="ml-auto shrink-0 font-mono text-[9.5px] text-white/30">
                  {cleared}/{liveInGroup.length}
                </span>
                <ChevronDown
                  size={12}
                  aria-hidden
                  className={`shrink-0 text-white/30 transition-transform ${isShut ? '-rotate-90' : ''}`}
                />
              </button>
              {!isShut &&
                group.habits.map((h) => (
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
            </section>
          );
        })}
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
  const Icon = habitIcon(habit.icon);
  // Ticking a habit that hasn't started earns no tile, so the row must not
  // offer a tick it won't honour.
  const pending = !isHabitActiveOn(habit, today);
  const startsOn = new Date(`${habit.startsAt.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

  const [editing, setEditing] = useState(false);
  const [typingCount, setTypingCount] = useState(false);
  const [draftCount, setDraftCount] = useState('');
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

  const openCount = () => {
    setDraftCount(String(current));
    setTypingCount(true);
  };

  const commitCount = async () => {
    setTypingCount(false);
    const n = Number(draftCount);
    if (!draftCount.trim() || !Number.isFinite(n)) return;
    await onTick(habit, Math.max(0, Math.min(Math.round(n), target)));
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

        {/* Where it sits in the day. Applies immediately — the row jumps to its
            new group, which is the clearest confirmation the change took. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {SLOTS.map((s) => {
            const chosen = slotOf(habit) === s.id;
            return (
              <button
                key={s.id}
                onClick={() => updateHabit(habit.id, { slot: s.id })}
                aria-pressed={chosen}
                className="rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition-colors cursor-pointer"
                style={{
                  color: chosen ? s.color : 'rgba(255,255,255,0.4)',
                  borderColor: chosen ? s.color : 'rgba(255,255,255,0.1)',
                  backgroundColor: chosen ? `${s.color}1a` : 'transparent',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Bad habits get their own layout entirely, not a variant of the good-habit
  // one. `done` (isDone: value >= target) is true exactly when you DID the
  // bad thing — reusing the generic row would fill the circle brand-green and
  // strike the label through for doing Instagram, which reads as an
  // achievement. There are three real states here, not two: avoided (logged
  // 0), did it (logged >0), and unlogged (no entry yet) — `current` collapses
  // the last two to the same number, so this needs its own hasEntry check.
  if (habit.kind === 'bad') {
    const hasEntry = entries.some((e) => e.habitId === habit.id && e.day === today);
    const badState: 'avoided' | 'did' | 'unlogged' = !hasEntry ? 'unlogged' : done ? 'did' : 'avoided';
    const showAvoid = habit.badMode === 'reward_avoid' || habit.badMode === 'both';
    const showDid = habit.badMode === 'penalty_do' || habit.badMode === 'both';

    return (
      <div
        className={`flex items-center gap-2 rounded-2xl border px-3 py-3 transition-all sm:gap-3 sm:px-3.5 ${
          pending
            ? 'border-white/5 bg-white/[0.015]'
            : badState === 'avoided'
              ? 'border-brand-400/30 bg-brand-500/10'
              : badState === 'did'
                ? 'border-red-400/30 bg-red-500/10'
                : 'border-white/8 bg-white/[0.03]'
        }`}
      >
        <Icon size={15} aria-hidden className="shrink-0 opacity-90" style={{ color: habit.color }} />

        <button onClick={openEdit} className="min-w-0 flex-1 text-left cursor-text" aria-label={`Edit ${habit.label}`}>
          <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${badState === 'did' ? 'text-red-200' : 'text-white/90'}`}>
            <span className="truncate">{habit.label}</span>
            {habit.private && <Lock size={11} className="shrink-0 text-white/30" aria-label="Name hidden from the room" />}
          </span>
          {pending && <span className="mt-0.5 block font-mono text-[10.5px] text-white/30">starts {startsOn}</span>}
        </button>

        {!pending && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* The prominent one — this is the win. */}
            {showAvoid && (
              <button
                onClick={() => (badState === 'avoided' ? onUntick(habit) : onTick(habit, 0))}
                aria-pressed={badState === 'avoided'}
                aria-label={
                  badState === 'avoided' ? `Undo — you avoided ${habit.label} today` : `Mark ${habit.label} avoided today`
                }
                className={`flex h-11 items-center gap-1 rounded-full border-2 px-3 text-[11px] font-bold transition-all cursor-pointer sm:h-8 ${
                  badState === 'avoided'
                    ? 'border-brand-400 bg-brand-400 text-black'
                    : 'border-white/20 text-white/50 hover:border-white/40'
                }`}
              >
                <ShieldCheck size={13} /> Avoided
              </button>
            )}
            {/* Deliberately small and muted — logging that you did the bad
                thing must never look like the more tempting of two buttons. */}
            {showDid && (
              <button
                onClick={() => (badState === 'did' ? onUntick(habit) : onTick(habit, 1))}
                aria-pressed={badState === 'did'}
                aria-label={badState === 'did' ? `Undo — you logged ${habit.label} today` : `Log that you did ${habit.label} today`}
                className={`flex h-11 items-center gap-1 rounded-full border px-2.5 text-[10.5px] font-semibold transition-all cursor-pointer sm:h-8 ${
                  badState === 'did'
                    ? 'border-red-400/50 bg-red-500/15 text-red-300'
                    : 'border-white/10 text-white/30 hover:text-white/50'
                }`}
              >
                <X size={12} /> Did it
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-3 py-3 transition-all sm:gap-3 sm:px-3.5 ${
        pending
          ? 'border-white/5 bg-white/[0.015]'
          : done
            ? 'border-brand-400/30 bg-brand-500/10'
            : 'border-white/8 bg-white/[0.03]'
      }`}
    >
      {/* One tap = done, counter or not. Reaching a 5000-step target by
          pressing + is not a thing anyone will do twice; the +/- pair and the
          typed value below are for logging a partial day, not for finishing one. */}
      <button
        onClick={() => (done ? onUntick(habit) : onTick(habit, target))}
        disabled={pending}
        aria-pressed={done}
        aria-label={
          pending ? `${habit.label} starts ${startsOn}` : done ? `Clear ${habit.label}` : `Mark ${habit.label} done`
        }
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-all sm:h-7 sm:w-7 ${
          pending
            ? 'cursor-not-allowed border-dashed border-white/15'
            : done
              ? 'cursor-pointer border-brand-400 bg-brand-400 text-black'
              : 'cursor-pointer border-white/25 hover:border-white/50'
        }`}
      >
        {done && (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Check size={14} strokeWidth={4} />
          </motion.span>
        )}
      </button>

      <Icon
        size={15}
        aria-hidden
        className={`shrink-0 transition-opacity ${done ? 'opacity-30' : 'opacity-90'}`}
        style={{ color: habit.color }}
      />

      <div className="min-w-0 flex-1">
        <button onClick={openEdit} className="block max-w-full text-left cursor-text" aria-label={`Edit ${habit.label}`}>
          <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${done ? 'text-white/50 line-through' : 'text-white/90'}`}>
            <span className="truncate">{habit.label}</span>
            {habit.private && <Lock size={11} className="shrink-0 text-white/30" aria-label="Name hidden from the room" />}
          </span>
        </button>

        {pending ? (
          <span className="mt-0.5 block font-mono text-[10.5px] text-white/30">starts {startsOn}</span>
        ) : (
          isCounter &&
          (typingCount ? (
            <input
              autoFocus
              inputMode="numeric"
              value={draftCount}
              onChange={(e) => setDraftCount(e.target.value.replace(/\D/g, ''))}
              onBlur={commitCount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCount();
                if (e.key === 'Escape') setTypingCount(false);
              }}
              aria-label={`Set ${habit.label} to an exact value`}
              className="liquid-glass-input mt-0.5 w-20 rounded-lg px-2 py-0.5 font-mono text-[10.5px] text-white outline-none focus:border-brand-500/50"
            />
          ) : (
            // Underlined and pencil-marked at rest, not just on hover — hover
            // means nothing on a phone, and this is the one control on the row
            // that isn't visually obvious as tappable otherwise.
            <button
              onClick={openCount}
              aria-label={`Type an exact value for ${habit.label}`}
              className="mt-0.5 flex items-center gap-1 font-mono text-[10.5px] text-white/40 underline decoration-dotted decoration-white/25 underline-offset-2 transition-colors hover:text-white/70 hover:decoration-white/50 cursor-text"
            >
              {current}/{target} {habit.unit ?? ''}
              <Pencil size={9} className="shrink-0 opacity-60" />
            </button>
          ))
        )}
      </div>

      {isCounter && !pending && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onTick(habit, stepped(current, target, -1))}
            aria-label={`Decrease ${habit.label} by ${stepFor(target)}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer sm:h-auto sm:w-auto sm:p-1.5"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => onTick(habit, stepped(current, target, 1))}
            aria-label={`Increase ${habit.label} by ${stepFor(target)}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer sm:h-auto sm:w-auto sm:p-1.5"
          >
            <Plus size={13} />
          </button>
        </div>
      )}

      {/* Hidden on phones: at 44px touch targets there isn't room for it beside
          +/-, and sitting next to + it collects mis-taps that throw you into an
          edit form mid-log. Tapping the habit's name opens the same editor. */}
      <button
        onClick={openEdit}
        aria-label={`Edit ${habit.label}`}
        className="hidden shrink-0 rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white cursor-pointer sm:block"
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}

function Stat({
  icon,
  label,
  short,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  /** Phone-width label. "Misses left" doesn't fit a quarter of 375px. */
  short?: string;
  value: string;
  sub?: string;
  tint: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-2 sm:rounded-2xl sm:px-3.5 sm:py-2.5">
      <p className="flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wider text-white/40 sm:gap-1.5 sm:text-[9.5px] sm:tracking-widest">
        {icon}
        <span className="truncate sm:hidden">{short ?? label}</span>
        <span className="hidden truncate sm:inline">{label}</span>
      </p>
      <p className={`mt-0.5 text-base font-extrabold sm:mt-1 sm:text-xl ${tint}`}>
        {value}
        {sub && <span className="ml-1 hidden text-[10px] font-normal text-white/35 sm:inline">{sub}</span>}
      </p>
    </div>
  );
}
