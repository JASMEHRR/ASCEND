/**
 * Arena hub — the shared habit board.
 *
 * A left rail carries the six surfaces and the room switcher, matching the
 * app's own sidebar rather than the horizontal strip habit-arena used. Below
 * `lg` the rail collapses to a scrolling chip row so the phone layout stays
 * usable.
 */
import { useState, type ReactNode } from 'react';
import {
  BarChart3,
  CheckSquare,
  Loader2,
  MessagesSquare,
  Plus,
  Puzzle,
  Settings2,
  Trophy,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { readStore, writeStore } from '../../lib/storage';
import { useArena } from './ArenaContext';
import ArenaToday from './panels/ArenaToday';
import ArenaLeaderboard from './panels/ArenaLeaderboard';
import ArenaChat from './panels/ArenaChat';
import ArenaSettings from './panels/ArenaSettings';
import ArenaJoin from './panels/ArenaJoin';
import ArenaPuzzle from './panels/ArenaPuzzle';
import ArenaStats from './panels/ArenaStats';

type Tab = 'today' | 'puzzle' | 'board' | 'stats' | 'chat' | 'settings';

const TABS: { key: Tab; label: string; brief: string; icon: ReactNode }[] = [
  { key: 'today', label: 'Today', brief: "Tick off today's habits.", icon: <CheckSquare size={15} /> },
  { key: 'puzzle', label: 'Puzzle', brief: "This week's picture.", icon: <Puzzle size={15} /> },
  { key: 'board', label: 'Board', brief: 'Who showed up this week.', icon: <Trophy size={15} /> },
  { key: 'stats', label: 'Stats', brief: 'Streaks and history.', icon: <BarChart3 size={15} /> },
  { key: 'chat', label: 'Chat', brief: 'Talk to the room.', icon: <MessagesSquare size={15} /> },
  { key: 'settings', label: 'Settings', brief: 'Habits, privacy, room.', icon: <Settings2 size={15} /> },
];

export default function ArenaHub() {
  const { loading, room, rooms, selectRoom } = useArena();
  const [tab, setTab] = useState<Tab>('today');
  const [joining, setJoining] = useState(false);
  // The rail is wide, and on a laptop the puzzle wants the room. Remembered so
  // the choice survives a reload.
  const [railOpen, setRailOpen] = useState(
    () => readStore('ascend_arena_rail') !== 'closed',
  );
  const toggleRail = () => {
    setRailOpen((open) => {
      writeStore('ascend_arena_rail', open ? 'closed' : 'open');
      return !open;
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    );
  }

  // Only shown when the player asks for it. A room is optional now — habits
  // and the weekly picture are yours whether or not anyone else is watching.
  if (joining) {
    return <ArenaJoin onDone={() => setJoining(false)} canCancel />;
  }

  // Board and Chat are the only surfaces that need other people.
  const needsRoom = tab === 'board' || tab === 'chat';

  const body = (
    <>
      {tab === 'today' && <ArenaToday onManualSetup={() => setTab('settings')} />}
      {tab === 'puzzle' && <ArenaPuzzle onNeedHabits={() => setTab('today')} />}
      {needsRoom && !room && (
        <div className="mx-auto flex min-h-[240px] max-w-sm flex-col items-center justify-center gap-3 text-center">
          <Users size={26} className="text-white/20" />
          <h3 className="text-[14px] font-bold text-white">This part needs a room</h3>
          <p className="text-[12px] leading-snug text-white/40">
            Your habits and picture are yours either way — a room just adds people who can see you showed up.
          </p>
          <button
            onClick={() => setJoining(true)}
            className="mt-1 rounded-full bg-brand-500 px-4 py-2 text-[12px] font-bold text-black transition-all hover:bg-brand-400 cursor-pointer"
          >
            Start or join a room
          </button>
        </div>
      )}
      {tab === 'board' && room && <ArenaLeaderboard />}
      {tab === 'chat' && room && <ArenaChat />}
      {tab === 'settings' && <ArenaSettings />}
      {tab === 'stats' && <ArenaStats />}
    </>
  );

  return (
    <div className="flex h-full w-full min-h-0 gap-4">
      {/* Rail — collapsible to an icon strip. */}
      {!railOpen && (
        <aside className="hidden shrink-0 lg:flex">
          <div className="liquid-glass-panel flex h-full flex-col items-center gap-1.5 rounded-[2rem] p-2">
            <button
              onClick={toggleRail}
              aria-label="Expand panel list"
              title="Expand"
              className="rounded-xl p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <PanelLeftOpen size={16} />
            </button>
            <span className="my-0.5 h-px w-6 bg-white/10" />
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-label={t.label}
                title={t.label}
                className={`rounded-xl p-2.5 transition-all cursor-pointer ${
                  tab === t.key ? 'bg-white/15 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/85'
                }`}
              >
                {t.icon}
              </button>
            ))}
          </div>
        </aside>
      )}

      <aside className={`${railOpen ? 'hidden w-60 shrink-0 lg:flex' : 'hidden'}`}>
        <div className="liquid-glass-panel flex h-full w-full flex-col gap-1.5 overflow-y-auto custom-scrollbar rounded-[2rem] p-3">
          {/* Rooms — always listed, never behind a menu. Seeing every board you
              belong to is the point of a shared tracker. */}
          <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5">
            <p className="font-mono text-[9px] font-extrabold uppercase tracking-[0.18em] leading-none text-white/40">
              Rooms · {rooms.length}
            </p>
            <div className="flex items-center gap-0.5">
            <button
              onClick={() => setJoining(true)}
              aria-label="New or join a room"
              title="New or join a room"
              className="rounded-lg p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-brand-300 cursor-pointer"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={toggleRail}
              aria-label="Collapse panel list"
              title="Collapse"
              className="rounded-lg p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <PanelLeftClose size={13} />
            </button>
            </div>
          </div>

          <div className="space-y-1 pb-1">
            {rooms.length === 0 && (
              <button
                onClick={() => setJoining(true)}
                className="w-full rounded-xl border border-dashed border-white/12 px-3 py-2.5 text-[11px] font-semibold text-white/35 transition-all hover:border-brand-400/40 hover:text-brand-300 cursor-pointer"
              >
                No rooms yet — add one
              </button>
            )}
            {rooms.map((r) => {
              const active = r.id === room?.id;
              return (
                <button
                  key={r.id}
                  onClick={() => selectRoom(r.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-brand-400/40 bg-brand-500/15 text-white'
                      : 'border-transparent text-white/50 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-brand-400' : 'bg-white/15'}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{r.name}</span>
                  <span className="shrink-0 font-mono text-[9px] tracking-wider text-white/30">{r.code}</span>
                </button>
              );
            })}
          </div>

          <p className="border-t border-white/8 px-1.5 pb-1 pt-3 font-mono text-[9px] font-extrabold uppercase tracking-[0.18em] leading-none text-white/40">
            {room?.name ?? 'My board'}
          </p>

          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                  active
                    ? 'border-white/20 bg-white/15 text-white'
                    : 'border-transparent bg-white/[0.02] text-white/45 hover:border-white/10 hover:bg-white/[0.07] hover:text-white/85'
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${active ? 'text-white' : 'text-white/40'}`}>{t.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-wider leading-tight">{t.label}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-white/35">{t.brief}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* Compact switcher + tabs below lg. */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <div className="liquid-glass-panel flex flex-1 items-center gap-1 overflow-x-auto rounded-full px-1.5 py-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  tab === t.key ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/85'
                }`}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
          {/* A room is optional, so this must tolerate not having one. */}
          <button
            onClick={() => setJoining(true)}
            aria-label={room ? 'Switch or join a room' : 'Start or join a room'}
            className="shrink-0 rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 font-mono text-[10px] tracking-[0.15em] text-brand-300 cursor-pointer"
          >
            {room?.code ?? '+ room'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1">{body}</div>
      </div>
    </div>
  );
}
