/**
 * Server-side Arena/reminders context — the Telegram webhook's equivalent of
 * what ArenaRegistrar.tsx and jarvis-desktop build client-side, since a
 * Telegram message has no browser tab or Electron process behind it to read
 * a live Firestore subscription from.
 *
 * Reuses the actual pure logic (isHabitActiveOn, isDone, tilesEarnedOn) from
 * src/features/arena/logic — those are explicitly documented as dependency-
 * free (no React, no Firestore), so importing them here duplicates zero
 * business logic. The alternative (reimplementing "is a habit active" a
 * second time) is exactly the kind of drift that already caused two bugs
 * this session.
 */
import { getAdminDb } from './admin-db';
import { todayStr } from './src/features/arena/logic/dates';
import { activeHabits, isDone, tilesEarnedOn } from './src/features/arena/logic/tiles';
import type { Habit, Entry } from './src/features/arena/logic/types';

/** Same shape ArenaRegistrar.tsx sends under context.arena — see jarvis-routes.ts's persona prompt. */
export interface ArenaContext {
  habits: string[];
  doneToday: number;
  totalHabits: number;
  piecesToday: number;
}

export interface TelegramAppContext {
  arena: ArenaContext | null;
  pendingReminders: { text: string; dueAt: string }[];
}

/**
 * Fetches one user's Arena + reminders snapshot via the Admin SDK. Returns
 * arena: null (not an empty habit list) when Firestore is unreachable or
 * unconfigured, so the persona prompt's "answer from this block" instruction
 * doesn't get a false "you have zero habits" — the prompt already knows to
 * treat a missing key as "not available" rather than "empty".
 */
export async function buildTelegramContext(uid: string): Promise<TelegramAppContext> {
  const db = await getAdminDb();
  if (!db) return { arena: null, pendingReminders: [] };

  const today = todayStr();

  let arena: ArenaContext | null = null;
  try {
    const [habitsSnap, daySnap] = await Promise.all([
      db.collection(`users/${uid}/arenaHabits`).get(),
      db.doc(`users/${uid}/arenaDays/${today}`).get(),
    ]);
    const habits: Habit[] = habitsSnap.docs.map(
      (d) => ({ id: d.id, playerId: uid, ...d.data() }) as Habit,
    );
    const values = (daySnap.exists ? (daySnap.data()?.values as Record<string, number>) : {}) ?? {};
    const entries: Entry[] = Object.entries(values).map(([habitId, value]) => ({
      id: `${today}_${habitId}`,
      habitId,
      playerId: uid,
      day: today,
      value,
      at: '',
    }));
    const active = activeHabits(habits, today);
    arena = {
      habits: active.map((h) => h.label),
      doneToday: active.filter((h) => isDone(h, entries, today)).length,
      totalHabits: active.length,
      piecesToday: tilesEarnedOn(habits, entries, today),
    };
  } catch (err) {
    console.warn('[telegram-context] arena fetch failed:', (err as Error).message);
  }

  let pendingReminders: { text: string; dueAt: string }[] = [];
  try {
    const remindersSnap = await db.collection(`users/${uid}/reminders`).get();
    pendingReminders = remindersSnap.docs
      .map((d) => d.data() as { text?: string; dueAt?: string; done?: boolean })
      .filter((r) => !r.done)
      .map((r) => ({ text: String(r.text ?? ''), dueAt: String(r.dueAt ?? '') }));
  } catch (err) {
    console.warn('[telegram-context] reminders fetch failed:', (err as Error).message);
  }

  return { arena, pendingReminders };
}
