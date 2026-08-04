/**
 * Arena — the Firestore data layer.
 *
 * A rewrite of habit-arena/src/lib/rooms.js against Firestore. The function
 * shapes are deliberately kept close to the originals so the ported UI reads
 * the same, but three things change:
 *
 *   1. Auth is Ascend's Firebase Auth — Arena has no separate login, and
 *      playerId is simply the Firebase uid.
 *   2. Supabase Realtime channels become onSnapshot listeners.
 *   3. A day's habit values live in ONE document per player per day (see
 *      schema.ts), so opening a room is a handful of reads, not hundreds.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { todayStr, weekKey } from '../logic/dates';
import { activeHabits, tilesEarnedOn } from '../logic/tiles';
import type { DayKey, Entry, Habit, Player, PuzzleId, Room, RoomGame, WeekKey } from '../logic/types';
import {
  ROOMS,
  batchMessageId,
  daysPath,
  generateCode,
  habitsPath,
  messagesPath,
  playerPath,
  playersPath,
  publicDayId,
  publicPath,
  publicWeekId,
  roomGamesPath,
  weeksPath,
  type DayDoc,
  type DaySummary,
  type MessageDoc,
  type PuzzleDoc,
  type WeekDoc,
} from './schema';

const now = () => new Date().toISOString();

// --- rooms ---------------------------------------------------------------

/**
 * Create a room. The code is generated client-side and retried on collision —
 * with a 32-character alphabet and 6 places that's ~1e9 combinations, so a
 * clash is rare but not impossible.
 */
export async function createRoom(userId: string, name: string, profile: { name: string; avatar: string }): Promise<Room> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const existing = await getRoomByCode(code);
    if (existing) continue;
    const ref = doc(collection(db, ROOMS));
    const room: Room = { id: ref.id, code, name, createdBy: userId, createdAt: now(), puzzleMode: 'solo' };
    await setDoc(ref, { code, name, createdBy: userId, createdAt: room.createdAt, memberIds: [userId], puzzleMode: 'solo' });
    await addPlayer(ref.id, userId, profile);
    return room;
  }
  throw new Error('Could not allocate a room code. Try again.');
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const snap = await getDocs(query(collection(db, ROOMS), where('code', '==', code.toUpperCase()), fsLimit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<Room, 'id'>) };
}

/** Rooms this user belongs to. `memberIds` exists purely to make this one query. */
export async function listMyRooms(userId: string): Promise<Room[]> {
  const snap = await getDocs(query(collection(db, ROOMS), where('memberIds', 'array-contains', userId)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) }));
}

/**
 * Live version of the above. Creating or joining a room writes into this same
 * query, so subscribing keeps the room switcher current by itself — and means
 * a re-render can never observe an empty room list and bounce the player out
 * of the room they're sitting in.
 */
export function subscribeMyRooms(userId: string, cb: (rooms: Room[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, ROOMS), where('memberIds', 'array-contains', userId)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, 'id'>) }))),
    () => cb([]),
  );
}

export async function joinRoom(code: string, userId: string, profile: { name: string; avatar: string }): Promise<Room> {
  const room = await getRoomByCode(code);
  if (!room) throw new Error('No room with that code.');
  const existing = await getDoc(doc(db, playerPath(room.id, userId)));
  if (!existing.exists()) {
    await addPlayer(room.id, userId, profile);
  }
  // Checked every time, independent of the player doc: a player doc can exist
  // without membership if a previous join created it but then failed to add
  // the uid to memberIds (e.g. under rules that hadn't deployed yet). Without
  // this, retrying the join looks like it succeeds but never actually grants
  // access — every isMember() read (players, messages, the leaderboard) then
  // silently comes back empty.
  const roomRef = doc(db, ROOMS, room.id);
  const fresh = await getDoc(roomRef);
  const members: string[] = fresh.data()?.memberIds ?? [];
  if (!members.includes(userId)) await updateDoc(roomRef, { memberIds: [...members, userId] });
  return room;
}

/** Set by the room creator in Arena → Settings. See Room.puzzleMode. */
export async function setPuzzleMode(roomId: string, mode: 'solo' | 'shared'): Promise<void> {
  await updateDoc(doc(db, ROOMS, roomId), { puzzleMode: mode });
}

// --- the room game lifecycle -----------------------------------------------
//
// A 'shared' room's puzzle only exists while game.status is 'active'. Getting
// there is a lobby: the owner sets a duration, every current member readies
// up, and only then can the owner start it. When the timer runs out the game
// ends on its own (checked client-side — see ArenaContext) and the room drops
// back into a fresh lobby for the next one.

/** Owner sets how many days the next game will run, while still in lobby. */
export async function setGameDuration(roomId: string, durationDays: number): Promise<void> {
  await setDoc(
    doc(db, ROOMS, roomId),
    { game: { status: 'lobby', durationDays, ready: {} } satisfies RoomGame },
    { merge: true },
  );
}

/** A member readies up (or un-readies) in the lobby. */
export async function setReady(roomId: string, uid: string, ready: boolean): Promise<void> {
  await updateDoc(doc(db, ROOMS, roomId), { [`game.ready.${uid}`]: ready });
}

/**
 * Start the game: every member must be ready, per the room-owner rule. Opens
 * a fresh game canvas at `games/{startedAt}` — no stockpiled tiles carry in,
 * only fresh completions from here on count.
 */
export async function startGame(roomId: string, durationDays: number): Promise<PuzzleId> {
  const startedAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + durationDays * 86400000).toISOString();
  await updateDoc(doc(db, ROOMS, roomId), {
    game: { status: 'active', durationDays, ready: {}, startedAt, endsAt } satisfies RoomGame,
  });
  return startedAt;
}

/**
 * End the game — by timer or by the owner. The canvas is left exactly as it
 * stood (finished or not); a Gartic-Phone-style reveal posts that snapshot to
 * chat along with who placed how many pieces, then the room drops back to an
 * unconfigured lobby for the next round.
 */
export async function endGame(roomId: string, gameId: PuzzleId, playerNames: Record<string, string> = {}): Promise<void> {
  const snap = await getDoc(doc(db, roomGamesPath(roomId), gameId));
  const puzzle = snap.exists() ? (snap.data() as PuzzleDoc) : null;
  await setDoc(doc(db, roomGamesPath(roomId), gameId), { ended: true }, { merge: true });
  await updateDoc(doc(db, ROOMS, roomId), { game: { status: 'lobby', ready: {} } satisfies RoomGame });

  if (puzzle) {
    const total = puzzle.cols * puzzle.rows;
    const placed = puzzle.placements.length;
    const perPlayer = new Map<string, number>();
    for (const p of puzzle.placements) {
      if (p.playerId) perPlayer.set(p.playerId, (perPlayer.get(p.playerId) ?? 0) + 1);
    }
    const breakdown = [...perPlayer.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([uid, n]) => `${playerNames[uid] ?? 'Someone'}: ${n}`)
      .join(', ');
    const headline = placed >= total ? 'The picture finished' : `Time's up — ${placed}/${total} pieces placed`;
    await postEvent(roomId, breakdown ? `${headline}. ${breakdown}.` : `${headline}.`);
  }
}

// --- the room's game canvas -------------------------------------------------
//
// Successor to the shared-mode weeksPath below: keyed by PuzzleId (the game's
// startedAt) instead of a calendar WeekKey, since a game's window is set by
// the owner, not the calendar.

export async function getGamePuzzle(roomId: string, gameId: PuzzleId): Promise<PuzzleDoc | null> {
  const snap = await getDoc(doc(db, roomGamesPath(roomId), gameId));
  return snap.exists() ? (snap.data() as PuzzleDoc) : null;
}

export async function saveGamePuzzle(roomId: string, gameId: PuzzleId, data: Partial<PuzzleDoc>): Promise<void> {
  await setDoc(doc(db, roomGamesPath(roomId), gameId), data, { merge: true });
}

export async function listGamePuzzles(roomId: string): Promise<(PuzzleDoc & { id: PuzzleId })[]> {
  const snap = await getDocs(collection(db, roomGamesPath(roomId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as PuzzleDoc) }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Live version of getGamePuzzle. A tile another member places, or the game
 * ending on someone else's clock, needs to show up on this canvas without the
 * viewer switching tabs or doing anything to trigger a refetch — the whole
 * point of a shared board is seeing it move in real time.
 */
export function subscribeGamePuzzle(
  roomId: string,
  gameId: PuzzleId,
  cb: (puzzle: PuzzleDoc | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, roomGamesPath(roomId), gameId),
    (snap) => cb(snap.exists() ? (snap.data() as PuzzleDoc) : null),
    () => cb(null),
  );
}

// --- shared puzzle canvas --------------------------------------------------
//
// Only used when the room's puzzleMode is 'shared': one canvas for the whole
// room, at arenaRooms/{roomId}/weeks/{week}, distinct from the per-user
// canvases at users/{uid}/arenaWeeks/{week} that solo mode reads. Switching
// modes never merges the two — a shared canvas simply starts empty.

export const roomWeeksPath = (roomId: string) => `${ROOMS}/${roomId}/weeks`;

export async function getRoomWeek(roomId: string, week: WeekKey): Promise<WeekDoc | null> {
  const snap = await getDoc(doc(db, roomWeeksPath(roomId), week));
  return snap.exists() ? (snap.data() as WeekDoc) : null;
}

export async function saveRoomWeek(roomId: string, week: WeekKey, data: Partial<WeekDoc>): Promise<void> {
  await setDoc(doc(db, roomWeeksPath(roomId), week), data, { merge: true });
}

export async function listRoomWeeks(roomId: string): Promise<(WeekDoc & { week: WeekKey })[]> {
  const snap = await getDocs(collection(db, roomWeeksPath(roomId)));
  return snap.docs
    .map((d) => ({ week: d.id, ...(d.data() as WeekDoc) }))
    .sort((a, b) => b.week.localeCompare(a.week));
}

/**
 * Leave a room.
 *
 * Your habits, ticks and pictures are untouched — they live under your user
 * document, not the room, so leaving costs you nothing but the audience. Only
 * the summaries this room could see are cleared.
 *
 * Order matters: the mirror and player document must go while you are still a
 * member, because the rules authorise those writes through membership.
 * Dropping out of `memberIds` first would leave them stranded.
 */
export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await deletePlayerSubtree(roomId, userId);
  await deleteDoc(doc(db, playerPath(roomId, userId)));
  const roomRef = doc(db, ROOMS, roomId);
  const snap = await getDoc(roomRef);
  const members: string[] = snap.data()?.memberIds ?? [];
  await updateDoc(roomRef, { memberIds: members.filter((m) => m !== userId) });
}

/** Clear the room-visible summaries one player published to this room. */
async function deletePlayerSubtree(roomId: string, playerId: string): Promise<void> {
  const items = await getDocs(collection(db, `${playerPath(roomId, playerId)}/public`));
  if (items.empty) return;
  const batch = writeBatch(db);
  items.docs.forEach((i) => batch.delete(i.ref));
  await batch.commit();
}

/**
 * Delete a room and everything under it. Firestore does not cascade, so
 * subcollections must be walked explicitly — a plain deleteDoc would orphan
 * every player, habit and day beneath it.
 */
export async function deleteRoom(roomId: string): Promise<void> {
  const players = await getDocs(collection(db, playersPath(roomId)));
  for (const p of players.docs) {
    await deletePlayerSubtree(roomId, p.id);
    await deleteDoc(p.ref);
  }
  const msgs = await getDocs(collection(db, messagesPath(roomId)));
  const batch = writeBatch(db);
  msgs.docs.forEach((m) => batch.delete(m.ref));
  await batch.commit();
  await deleteDoc(doc(db, ROOMS, roomId));
}

// --- players -------------------------------------------------------------

async function addPlayer(roomId: string, userId: string, profile: { name: string; avatar: string }): Promise<void> {
  await setDoc(doc(db, playerPath(roomId, userId)), {
    name: profile.name,
    avatar: profile.avatar,
    joinedAt: now(),
  });
}

export async function listPlayers(roomId: string): Promise<Player[]> {
  const snap = await getDocs(collection(db, playersPath(roomId)));
  return snap.docs.map((d) => ({ id: d.id, roomId, userId: d.id, ...(d.data() as Omit<Player, 'id' | 'roomId' | 'userId'>) }));
}

export async function updatePlayer(roomId: string, playerId: string, fields: Partial<Player>): Promise<void> {
  await updateDoc(doc(db, playerPath(roomId, playerId)), fields as Record<string, unknown>);
}

// --- daily entries -------------------------------------------------------

/**
 * Recompute the room-visible summary for a day from its raw values.
 *
 * Private habits are counted here exactly like public ones — the room sees the
 * totals move, just never what moved them. That's also what keeps the room
 * streak honest when someone's habits are hidden.
 */
function summarise(habits: Habit[], values: Record<string, number>, day: DayKey): DaySummary {
  const active = activeHabits(habits, day);
  const entries: Entry[] = Object.entries(values).map(([habitId, value]) => ({
    id: `${day}_${habitId}`,
    habitId,
    playerId: '',
    day,
    value,
    at: '',
  }));
  const earned = tilesEarnedOn(active, entries, day);
  return { earned, total: active.length, cleared: active.length > 0 && earned >= active.length };
}

/**
 * Publish a day's summary to every room the player belongs to.
 *
 * The ticks themselves live under the user (data/habits.ts) because habits are
 * per-person, not per-room. What each room needs is the derived summary —
 * earned, total, cleared — so the leaderboard and room streak work without
 * every room storing its own copy of the same habits.
 */
export async function mirrorDay(
  roomIds: string[],
  playerId: string,
  day: DayKey,
  habits: Habit[],
  values: Record<string, number>,
): Promise<void> {
  if (roomIds.length === 0) return;
  const summary = summarise(habits, values, day);
  const at = now();
  const batch = writeBatch(db);
  for (const roomId of roomIds) {
    batch.set(doc(db, publicPath(roomId, playerId), publicDayId(day)), { ...summary, day, updatedAt: at });
  }
  await batch.commit();
}

/**
 * Another player's day summaries — the only view of someone else's board the
 * rules permit. Use this for the leaderboard and progress rings; `listEntries`
 * will be denied for anyone but yourself.
 */
export async function listPublicDays(
  roomId: string,
  playerId: string,
): Promise<(DaySummary & { day: DayKey })[]> {
  const snap = await getDocs(collection(db, publicPath(roomId, playerId)));
  return snap.docs
    .filter((d) => d.id.startsWith('day_'))
    .map((d) => d.data() as DaySummary & { day: DayKey });
}

/** Live version of the above, for the leaderboard. */
export function subscribePublicDays(
  roomId: string,
  playerId: string,
  cb: (days: (DaySummary & { day: DayKey })[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, publicPath(roomId, playerId)),
    (snap) =>
      cb(snap.docs.filter((d) => d.id.startsWith('day_')).map((d) => d.data() as DaySummary & { day: DayKey })),
    () => cb([]),
  );
}

// --- chat ----------------------------------------------------------------

/**
 * Record tile placements in chat as ONE rolling message per player per day.
 * Eight habits ticked posts a single updating line rather than eight messages,
 * which is what keeps the room readable.
 */
export async function postBatch(
  roomId: string,
  playerId: string,
  name: string,
  day: DayKey,
  count: number,
): Promise<void> {
  const id = batchMessageId(playerId, day);
  const body = `${name} placed ${count} ${count === 1 ? 'piece' : 'pieces'}`;
  await setDoc(
    doc(db, messagesPath(roomId), id),
    { playerId, kind: 'batch', body, day, count, at: now() } satisfies MessageDoc,
    { merge: true },
  );
}

/** Milestones get their own message: cleared day, finished picture, streak. */
export async function postEvent(roomId: string, body: string, playerId: string | null = null): Promise<void> {
  await setDoc(doc(collection(db, messagesPath(roomId))), {
    playerId,
    kind: 'event',
    body,
    at: now(),
  } satisfies MessageDoc);
}

export async function sendMessage(roomId: string, playerId: string, body: string): Promise<void> {
  await setDoc(doc(collection(db, messagesPath(roomId))), {
    playerId,
    kind: 'text',
    body,
    at: now(),
  } satisfies MessageDoc);
}

// --- live subscriptions --------------------------------------------------

/** Live player list for the leaderboard. */
export function subscribePlayers(roomId: string, cb: (players: Player[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, playersPath(roomId)),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, roomId, userId: d.id, ...(d.data() as Omit<Player, 'id' | 'roomId' | 'userId'>) }))),
    // Denied reads (rules not deployed, or not a member yet) should degrade to
    // an empty board, not an uncaught listener error.
    () => cb([]),
  );
}

export function subscribeMessages(
  roomId: string,
  cb: (messages: (MessageDoc & { id: string })[]) => void,
  max = 100,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, messagesPath(roomId)), orderBy('at', 'desc'), fsLimit(max)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as MessageDoc) })).reverse()),
    () => cb([]),
  );
}

/** The current week key, for callers that shouldn't import the date helpers. */
export const currentWeek = (): WeekKey => weekKey(todayStr());
