/**
 * Arena state: the active room, its players, your habits and ticks, and the
 * live subscriptions that keep them current.
 *
 * Everything the room can see is subscribed; everything private is fetched for
 * the signed-in player only. The active room id is remembered in localStorage
 * so reopening Ascend lands you back on the same board.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { readStore, writeStore } from '../../lib/storage';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  createRoom as createRoomDoc,
  joinRoom as joinRoomDoc,
  leaveRoom as leaveRoomDoc,
  deleteRoom as deleteRoomDoc,
  mirrorDay,
  postBatch,
  postEvent,
  setPuzzleMode as setPuzzleModeDoc,
  subscribeMessages,
  subscribeMyRooms,
  subscribePlayers,
} from './data/rooms';
// Habits live under the user, not the room: one set, shared by every room you
// belong to. Rooms hold membership, chat, and the public summaries.
import {
  addHabit as addHabitDoc,
  deleteHabit as deleteHabitDoc,
  getDay,
  removeHabit as removeHabitDoc,
  setAllHabitsPrivacy as setAllPrivacyDoc,
  setHabitPrivacy as setPrivacyDoc,
  subscribeDays,
  subscribeHabits,
  updateHabit as updateHabitDoc,
  writeDayValues,
} from './data/habits';
import { migrateRitualsOnce } from './data/migrate';
import type { MessageDoc } from './data/schema';
import { todayStr, weekDays, weekKey } from './logic/dates';
import { clearedDay, dailyStreak } from './logic/streaks';
import { tilesEarnedOn, wallet, weekMisses } from './logic/tiles';
import type { DayKey, Entry, Habit, Player, Room } from './logic/types';

const ROOM_KEY = 'ascend_arena_room';

/** A habit as supplied by the UI; ids and timestamps are filled in on write. */
export type NewHabit = Omit<Habit, 'id' | 'playerId' | 'createdAt' | 'startsAt'> & { startsAt?: string };

export interface ArenaValue {
  loading: boolean;
  room: Room | null;
  rooms: Room[];
  players: Player[];
  habits: Habit[];
  entries: Entry[];
  messages: (MessageDoc & { id: string })[];
  today: DayKey;
  /** Tiles earned today and across this week, plus the miss budget. */
  todayTiles: number;
  earnedThisWeek: number;
  misses: ReturnType<typeof weekMisses>;
  streak: number;
  selectRoom: (roomId: string) => void;
  createRoom: (name: string) => Promise<Room>;
  joinRoom: (code: string) => Promise<Room>;
  leaveRoom: () => Promise<void>;
  /** Delete the active room and everything in it. Creator only. */
  deleteRoom: () => Promise<void>;
  /** Whether the signed-in player created the active room. */
  isRoomOwner: boolean;
  /** Room creator only; see Room.puzzleMode. */
  setPuzzleMode: (mode: 'solo' | 'shared') => Promise<void>;
  /**
   * Run any Arena write, surfacing a permission-denied error as the same
   * "deploy the rules" toast as every other mutation here. Exposed so
   * satellite hooks (useRoomGame, the gallery) don't need to duplicate the
   * error-toast wiring themselves.
   */
  guardArena: <T,>(fn: () => Promise<T>) => Promise<T | undefined>;
  addHabit: (habit: NewHabit) => Promise<void>;
  updateHabit: (habitId: string, fields: Partial<Habit>) => Promise<void>;
  removeHabit: (habitId: string) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
  setPrivacy: (habitId: string, isPrivate: boolean) => Promise<void>;
  setAllPrivacy: (isPrivate: boolean) => Promise<void>;
  tick: (habit: Habit, value: number) => Promise<void>;
  untick: (habit: Habit) => Promise<void>;
}

const ArenaContext = createContext<ArenaValue | null>(null);

export function ArenaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const uid = user?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<string | null>(() => readStore(ROOM_KEY));
  const [players, setPlayers] = useState<Player[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [messages, setMessages] = useState<(MessageDoc & { id: string })[]>([]);

  const today = todayStr();

  /**
   * A room we just created or joined, held until the subscription catches up.
   *
   * `room` is derived from the subscribed list, and Firestore takes a moment
   * to deliver a brand-new document. Without this the player would be dropped
   * back onto the join screen for a beat immediately after creating a room.
   */
  const [pending, setPending] = useState<Room | null>(null);

  const room = useMemo(() => {
    const found = rooms.find((r) => r.id === roomId);
    if (found) return found;
    return pending && pending.id === roomId ? pending : null;
  }, [rooms, roomId, pending]);

  // Once the real document arrives, stop holding the local copy.
  useEffect(() => {
    if (pending && rooms.some((r) => r.id === pending.id)) setPending(null);
  }, [rooms, pending]);

  // Which rooms this user belongs to.
  useEffect(() => {
    if (!uid) {
      setRooms([]);
      setLoading(false);
      return;
    }
    // Live, not a one-shot fetch. Creating a room or joining one writes to
    // this same query, so a subscription keeps the switcher current without
    // any manual refetching — and, more importantly, a re-render can never
    // catch `rooms` empty and bounce the player back to the join screen.
    return subscribeMyRooms(uid, (rs) => {
      setRooms(rs);
      setRoomId((cur) => {
        // Keep the remembered room while it still exists.
        if (cur && rs.some((r) => r.id === cur)) return cur;
        // A room just created or joined may not have reached this snapshot
        // yet. Clearing the id here would drop the player onto the join
        // screen a beat after they left it, so only fall back once the
        // remembered room is genuinely absent from a non-empty list.
        if (cur && rs.length === 0) return cur;
        return rs[0]?.id ?? null;
      });
      setLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    if (roomId) writeStore(ROOM_KEY, roomId);
  }, [roomId]);

  // Carry the old fixed ritual list across on first run, so switching to
  // Arena doesn't cost anyone the routine they were already keeping.
  useEffect(() => {
    if (!uid) return;
    migrateRitualsOnce(uid)
      .then((n) => {
        if (n > 0) {
          toast.show({
            kind: 'info',
            title: 'Your rituals moved to Arena',
            message: `${n} habits imported. Edit or remove any of them in Arena → Settings.`,
          });
        }
      })
      .catch(() => {
        /* not worth interrupting the app over; the user can add habits by hand */
      });
  }, [uid, toast]);

  // Habits and ticks are per-user, so they're subscribed independently of any
  // room — they exist before you join one and stay the same across all of
  // them. Days are scoped to this week so a listener costs seven reads rather
  // than the player's whole history.
  useEffect(() => {
    if (!uid) {
      setHabits([]);
      setEntries([]);
      return;
    }
    const unsubs = [subscribeHabits(uid, setHabits), subscribeDays(uid, weekDays(today), setEntries)];
    return () => unsubs.forEach((u) => u());
  }, [uid, today]);

  // Room-scoped data: who's in it and what's been said.
  useEffect(() => {
    if (!roomId) {
      setPlayers([]);
      setMessages([]);
      return;
    }
    const unsubs = [subscribePlayers(roomId, setPlayers), subscribeMessages(roomId, setMessages)];
    return () => unsubs.forEach((u) => u());
  }, [roomId]);

  const mine = useMemo(() => habits.filter((h) => !h.removedAt || weekKey(h.removedAt.slice(0, 10)) >= weekKey(today)), [habits, today]);

  const todayTiles = useMemo(() => tilesEarnedOn(mine, entries, today), [mine, entries, today]);
  const misses = useMemo(() => weekMisses(mine, entries, today, today), [mine, entries, today]);
  // Tiles earned this week. The *spendable* balance depends on placements
  // across every canvas, so it lives in usePuzzle() where those are loaded —
  // computing it here without them would report every earned tile as spare.
  const earnedThisWeek = useMemo(
    () => wallet(mine, entries, [], weekDays(today)).earned,
    [mine, entries, today],
  );
  const streak = useMemo(() => dailyStreak(mine, entries, today), [mine, entries, today]);

  const profile = useMemo(
    () => ({ name: (user?.email ?? 'player').split('@')[0], avatar: '' }),
    [user?.email],
  );

  // Neither of these appends to `rooms` by hand: the subscription is watching
  // the same query and will deliver the new room itself. Doing both would list
  // it twice.
  const createRoom = useCallback(
    async (name: string) => {
      if (!uid) throw new Error('Sign in first.');
      const r = await createRoomDoc(uid, name, profile);
      setPending(r);
      setRoomId(r.id);
      return r;
    },
    [uid, profile],
  );

  const joinRoom = useCallback(
    async (code: string) => {
      if (!uid) throw new Error('Sign in first.');
      const r = await joinRoomDoc(code, uid, profile);
      setPending(r);
      setRoomId(r.id);
      return r;
    },
    [uid, profile],
  );

  const leaveRoom = useCallback(async () => {
    if (!uid || !roomId) return;
    await leaveRoomDoc(roomId, uid);
    // The subscription drops the room on its own; clearing roomId here just
    // avoids a frame pointing at a room we've already left.
    setRoomId(null);
  }, [uid, roomId]);

  const deleteRoom = useCallback(async () => {
    if (!roomId) return;
    await deleteRoomDoc(roomId);
    setRoomId(null);
  }, [roomId]);

  const setPuzzleMode = useCallback(
    async (mode: 'solo' | 'shared') => {
      if (!roomId) return;
      try {
        await setPuzzleModeDoc(roomId, mode);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.show({ kind: 'warning', title: "That didn't save", message: msg });
      }
    },
    [roomId, toast],
  );

  /**
   * A day's stored values as the Entry list the pure logic expects. The tick
   * path needs this before the subscription round-trips, so the chat message
   * reflects the tick that just happened rather than the one before it.
   */
  const entriesFrom = useCallback(
    (values: Record<string, number>, day: DayKey, playerId: string): Entry[] =>
      Object.entries(values).map(([habitId, value]) => ({
        id: `${day}_${habitId}`,
        habitId,
        playerId,
        day,
        value,
        at: '',
      })),
    [],
  );

  /** Days already announced as cleared, so the room hears it once. */
  const announcedRef = useRef<Set<string>>(new Set());

  /**
   * Record (or clear) one habit's value for today.
   *
   * The ticks live under the user, so this is a single write no matter how
   * many rooms you're in — then the derived summary is mirrored to each room
   * so their leaderboards move. Passing `null` clears the habit for the day.
   */
  const writeTick = useCallback(
    async (u: string, habitId: string, value: number | null) => {
      const values = await getDay(u, today);
      if (value === null) delete values[habitId];
      else values[habitId] = value;
      await writeDayValues(u, today, values);

      // Best-effort from here: a failed broadcast must never lose the tick.
      const roomIds = rooms.map((r) => r.id);
      try {
        await mirrorDay(roomIds, u, today, mine, values);

        // Tell the rooms — as ONE rolling message per person per day, not one
        // per habit. Six people ticking eight habits would otherwise be fifty
        // messages nobody reads.
        const earned = tilesEarnedOn(mine, entriesFrom(values, today, u), today);
        if (earned > 0) {
          const name = profile.name;
          await Promise.all(roomIds.map((id) => postBatch(id, u, name, today, earned)));
        }

        // Clearing every habit is its own moment, so it gets its own line.
        const cleared = clearedDay(mine, entriesFrom(values, today, u), today);
        if (cleared && !announcedRef.current.has(today)) {
          announcedRef.current.add(today);
          await Promise.all(roomIds.map((id) => postEvent(id, `${profile.name} cleared the day`, u)));
        }
      } catch {
        /* the leaderboard catches up on the next tick */
      }
    },
    [today, rooms, mine, profile.name],
  );

  /**
   * Run a habit mutation, surfacing failures instead of dropping them.
   *
   * Habits are per-user, so these need a signed-in uid but no room — you can
   * set up your board before joining anyone. Every one is a Firestore write
   * that can be denied, most often because the security rules haven't been
   * deployed, which would otherwise present as a tick that silently doesn't
   * stick. A toast makes that diagnosable rather than mysterious.
   */
  const guard = <T,>(fn: (uid: string) => Promise<T>): Promise<T | undefined> => {
    if (!uid) {
      toast.show({ kind: 'warning', message: 'Sign in to use Arena.' });
      return Promise.resolve(undefined);
    }
    return fn(uid).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.show({
        kind: 'warning',
        title: "That didn't save",
        message: /permission|insufficient/i.test(msg)
          ? 'Arena was denied by Firestore. Deploy the security rules: firebase deploy --only firestore:rules'
          : msg,
      });
      return undefined;
    });
  };

  /** Same error handling as `guard`, for callers that don't need the uid. */
  const guardArena = <T,>(fn: () => Promise<T>): Promise<T | undefined> => guard(() => fn());

  const value: ArenaValue = {
    loading,
    room,
    rooms,
    players,
    habits: mine,
    entries,
    messages,
    today,
    todayTiles,
    misses,
    earnedThisWeek,
    streak,
    selectRoom: setRoomId,
    createRoom,
    joinRoom,
    leaveRoom,
    deleteRoom,
    isRoomOwner: !!room && !!uid && room.createdBy === uid,
    setPuzzleMode,
    guardArena,
    addHabit: (habit) => guard((u) => addHabitDoc(u, habit)).then(() => undefined),
    updateHabit: (habitId, fields) => guard((u) => updateHabitDoc(u, habitId, fields)),
    removeHabit: (habitId) => guard((u) => removeHabitDoc(u, habitId)),
    deleteHabit: (habitId) => guard((u) => deleteHabitDoc(u, habitId)),
    setPrivacy: (habitId, p) => guard((u) => setPrivacyDoc(u, habitId, p)),
    setAllPrivacy: (p) => guard((u) => setAllPrivacyDoc(u, p)),
    tick: (habit, v) => guard((u) => writeTick(u, habit.id, v)),
    untick: (habit) => guard((u) => writeTick(u, habit.id, null)),
  };

  return <ArenaContext.Provider value={value}>{children}</ArenaContext.Provider>;
}

export function useArena(): ArenaValue {
  const ctx = useContext(ArenaContext);
  if (!ctx) throw new Error('useArena must be used within an <ArenaProvider>');
  return ctx;
}

/**
 * Context-optional variant for background registrars.
 *
 * A Jarvis registrar is a leaf that renders nothing, so it must never be able
 * to take the whole app down with it — during hot reloads the context module
 * can be swapped out from under a consumer, and a throw there blanks the
 * screen. Returning null lets the registrar simply sit out that render.
 */
export function useArenaOptional(): ArenaValue | null {
  return useContext(ArenaContext);
}
