/**
 * Jarvis tools for Arena — "add a habit", "tick water", "how am I doing".
 *
 * This is the pay-off of merging the two apps: neither could do it alone.
 * Setting up a board by voice is far less friction than typing habits into a
 * form, which matters most on the day someone first tries it.
 */
import { useEffect, useRef } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';
import { useArenaOptional, type ArenaValue } from './ArenaContext';
import { isDone } from './logic/tiles';

export default function ArenaRegistrar() {
  const { registerTools, registerContext } = useJarvis();
  // Optional on purpose: this renders nothing, so it must not be able to blank
  // the app if the provider is momentarily unavailable.
  const arena = useArenaOptional();

  const ref = useRef<ArenaValue | null>(arena);
  ref.current = arena;

  useEffect(
    () =>
      registerContext('arena', () => {
        const a = ref.current;
        if (!a?.room) return { arena: { inRoom: false } };
        const done = a.habits.filter((h) => isDone(h, a.entries, a.today)).length;
        return {
          arena: {
            inRoom: true,
            room: a.room.name,
            habits: a.habits.map((h) => h.label),
            doneToday: done,
            totalHabits: a.habits.length,
            piecesToday: a.todayTiles,
            streak: a.streak,
            missesLeftThisWeek: a.misses.remaining,
          },
        };
      }),
    [registerContext],
  );

  useEffect(() => {
    const tools: JarvisTool[] = [
      {
        name: 'addArenaHabit',
        module: 'Arena',
        description:
          "Add a habit to the user's Arena board. Use for any 'track X', 'add a habit', or 'I want to start doing X' request. Counter habits (e.g. 8 glasses of water) take a target and unit.",
        parameters: {
          label: 'the habit name, e.g. "Read 30 minutes"',
          target: 'optional number of reps needed per day (default 1)',
          unit: 'optional unit for counter habits, e.g. "glasses"',
          isPrivate: 'optional true to hide the name from the room',
        },
        validate: (a) => (String(a.label ?? '').trim() ? null : 'habit name is required'),
        execute: async (a) => {
          const s = ref.current;
          if (!s?.room) return { ok: false, message: 'no Arena room yet — create or join one first' };
          const target = Math.max(1, Math.round(Number(a.target) || 1));
          await s.addHabit({
            label: String(a.label).trim(),
            kind: 'good',
            icon: 'check',
            color: '#10b981',
            ...(target > 1 ? { target } : {}),
            ...(a.unit ? { unit: String(a.unit) } : {}),
            ...(a.isPrivate ? { private: true } : {}),
          });
          return { ok: true, message: `added "${String(a.label).trim()}" — it starts counting tomorrow` };
        },
      },
      {
        name: 'tickArenaHabit',
        module: 'Arena',
        description:
          "Mark one of the user's Arena habits done for today, earning a puzzle piece. Match the habit by name, case-insensitively.",
        parameters: { habit: 'the habit name to mark done', value: 'optional reps for counter habits' },
        validate: (a) => (String(a.habit ?? '').trim() ? null : 'habit name is required'),
        execute: async (a) => {
          const s = ref.current;
          if (!s) return { ok: false, message: 'Arena is not ready yet' };
          const needle = String(a.habit).trim().toLowerCase();
          const habit =
            s.habits.find((h) => h.label.toLowerCase() === needle) ??
            s.habits.find((h) => h.label.toLowerCase().includes(needle));
          if (!habit) return { ok: false, message: `no habit matching "${a.habit}"` };
          const target = habit.target && habit.target > 0 ? habit.target : 1;
          await s.tick(habit, Math.max(1, Math.round(Number(a.value) || target)));
          return { ok: true, message: `${habit.label} marked done` };
        },
      },
      {
        name: 'arenaStatus',
        module: 'Arena',
        description:
          "Read where the user stands in Arena today — habits done, pieces earned, streak, and how much of the weekly miss budget is left.",
        followUp: true,
        execute: () => {
          const s = ref.current;
          if (!s?.room) return { ok: true, message: 'not in an Arena room yet', data: { inRoom: false } };
          const done = s.habits.filter((h) => isDone(h, s.entries, s.today)).length;
          return {
            ok: true,
            message: `${done}/${s.habits.length} habits done today`,
            data: {
              room: s.room.name,
              doneToday: `${done}/${s.habits.length}`,
              piecesToday: s.todayTiles,
              piecesThisWeek: s.earnedThisWeek,
              streak: s.streak,
              missesLeft: s.misses.remaining,
              overBudget: s.misses.overBudget,
              remaining: s.habits.filter((h) => !isDone(h, s.entries, s.today)).map((h) => h.label),
            },
          };
        },
      },
    ];
    return registerTools('arena', tools);
  }, [registerTools]);

  return null;
}
