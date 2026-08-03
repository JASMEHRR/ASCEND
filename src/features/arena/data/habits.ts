/**
 * Habits and daily ticks — stored per user, not per room.
 *
 * Your habits are yours: joining a second room doesn't mean re-entering them,
 * and every room you belong to watches the same set. Rooms hold membership,
 * chat, and the leaderboard; the habits themselves live under the user, beside
 * the rest of Ascend's per-user state.
 *
 *   users/{uid}/arenaHabits/{habitId}
 *   users/{uid}/arenaDays/{YYYY-MM-DD}     one doc per day, all values
 *   users/{uid}/arenaWeeks/{YYYY-Www}      the puzzle canvas
 *
 * The room-visible mirror still lives under the room, because that's what the
 * other players are allowed to read (see rooms.ts::writeDay).
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { todayStr } from '../logic/dates';
import type { DayKey, Entry, Habit, WeekKey } from '../logic/types';
import type { DayDoc, WeekDoc } from './schema';

const now = () => new Date().toISOString();

export const habitsPath = (uid: string) => `users/${uid}/arenaHabits`;
export const daysPath = (uid: string) => `users/${uid}/arenaDays`;
export const weeksPath = (uid: string) => `users/${uid}/arenaWeeks`;

// --- habits --------------------------------------------------------------

export async function listHabits(uid: string): Promise<Habit[]> {
  const snap = await getDocs(collection(db, habitsPath(uid)));
  return snap.docs.map((d) => ({ id: d.id, playerId: uid, ...(d.data() as Omit<Habit, 'id' | 'playerId'>) }));
}

export function subscribeHabits(uid: string, cb: (habits: Habit[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, habitsPath(uid)),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, playerId: uid, ...(d.data() as Omit<Habit, 'id' | 'playerId'>) }))),
    () => cb([]),
  );
}

export async function addHabit(
  uid: string,
  habit: Omit<Habit, 'id' | 'playerId' | 'createdAt' | 'startsAt'> & { startsAt?: string },
): Promise<Habit> {
  const ref = doc(collection(db, habitsPath(uid)));
  // A habit added mid-week starts counting tomorrow: today is already partly
  // spent, and crediting it retroactively would be a free tile.
  const startsAt = habit.startsAt ?? todayStr();
  const body = { ...habit, startsAt, createdAt: now() };
  await setDoc(ref, body);
  return { id: ref.id, playerId: uid, ...body } as Habit;
}

/**
 * Removal is a soft delete that takes effect at week end — the habit keeps
 * counting through the current week, and the *following* week's canvas grows
 * by REMOVAL_PENALTY_TILES. See tiles.ts::projectedTiles.
 */
export async function removeHabit(uid: string, habitId: string): Promise<void> {
  await updateDoc(doc(db, habitsPath(uid), habitId), { removedAt: now() });
}

/** Drop a habit outright, used for ones added by mistake. */
export async function deleteHabit(uid: string, habitId: string): Promise<void> {
  await deleteDoc(doc(db, habitsPath(uid), habitId));
}

export async function updateHabit(uid: string, habitId: string, fields: Partial<Habit>): Promise<void> {
  await updateDoc(doc(db, habitsPath(uid), habitId), fields as Record<string, unknown>);
}

/**
 * Privacy is a property of the habit, so hiding a name hides it from every
 * room at once — you can't be open in one group and private in another.
 */
export async function setHabitPrivacy(uid: string, habitId: string, isPrivate: boolean): Promise<void> {
  await updateDoc(doc(db, habitsPath(uid), habitId), { private: isPrivate });
}

export async function setAllHabitsPrivacy(uid: string, isPrivate: boolean): Promise<void> {
  const habits = await listHabits(uid);
  if (habits.length === 0) return;
  const batch = writeBatch(db);
  habits.forEach((h) => batch.update(doc(db, habitsPath(uid), h.id), { private: isPrivate }));
  await batch.commit();
}

// --- daily ticks ---------------------------------------------------------

export async function getDay(uid: string, day: DayKey): Promise<Record<string, number>> {
  const snap = await getDoc(doc(db, daysPath(uid), day));
  return snap.exists() ? ((snap.data() as DayDoc).values ?? {}) : {};
}

export async function writeDayValues(uid: string, day: DayKey, values: Record<string, number>): Promise<void> {
  await setDoc(doc(db, daysPath(uid), day), { values, updatedAt: now() }, { merge: false });
}

/** Flatten day documents into the Entry shape the pure logic expects. */
export function subscribeDays(uid: string, days: DayKey[], cb: (entries: Entry[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, daysPath(uid)),
    (snap) => {
      const out: Entry[] = [];
      for (const d of snap.docs) {
        if (!days.includes(d.id)) continue;
        const data = d.data() as DayDoc;
        for (const [habitId, value] of Object.entries(data.values ?? {})) {
          out.push({ id: `${d.id}_${habitId}`, habitId, playerId: uid, day: d.id, value, at: data.updatedAt });
        }
      }
      cb(out);
    },
    () => cb([]),
  );
}

// --- puzzle weeks --------------------------------------------------------

export async function getWeek(uid: string, week: WeekKey): Promise<WeekDoc | null> {
  const snap = await getDoc(doc(db, weeksPath(uid), week));
  return snap.exists() ? (snap.data() as WeekDoc) : null;
}

export async function saveWeek(uid: string, week: WeekKey, data: Partial<WeekDoc>): Promise<void> {
  await setDoc(doc(db, weeksPath(uid), week), data, { merge: true });
}

export async function listWeeks(uid: string): Promise<(WeekDoc & { week: WeekKey })[]> {
  const snap = await getDocs(collection(db, weeksPath(uid)));
  return snap.docs
    .map((d) => ({ week: d.id, ...(d.data() as WeekDoc) }))
    .sort((a, b) => b.week.localeCompare(a.week));
}
