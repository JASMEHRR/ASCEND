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
import { fetchUpcomingEvents } from './google-oauth-routes';

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
  /**
   * Post Studio's inbox/classwork/apply status, mirrored into Firestore by
   * jarvis-desktop. Null when that app has never run, or when its own reads
   * failed. Post Studio itself is loopback-only on the user's laptop, so this
   * route can never fetch it directly — the mirror is the only path.
   */
  postStudio: (Record<string, unknown> & { staleness?: string }) | null;
  /** null = Calendar was never connected (see google-oauth-routes.ts /start), not "no events". */
  calendar: { summary: string; start: string }[] | null;
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
  if (!db) return { arena: null, pendingReminders: [], postStudio: null, calendar: null };

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

  // Mirrored by jarvis-desktop (see its mirrorPostStudio). Age matters more
  // than the data here: a six-hour-old classwork list reported as current is
  // worse than no answer, so the freshness is spelled out in words the model
  // will repeat rather than left as a raw timestamp to reason about.
  let postStudio: (Record<string, unknown> & { staleness?: string }) | null = null;
  try {
    const snap = await db.doc(`users/${uid}/postStudioMirror/latest`).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const mirroredAt = typeof data.mirroredAt === 'string' ? data.mirroredAt : null;
      const ageMin = mirroredAt ? Math.round((Date.now() - Date.parse(mirroredAt)) / 60000) : null;
      postStudio = {
        ...data,
        staleness:
          ageMin === null
            ? 'unknown age — treat as possibly out of date'
            : ageMin < 10
              ? `fresh (${ageMin} min old)`
              : `${ageMin} min old — jarvis-desktop may be closed; say so before relying on it`,
      };
    }
  } catch (err) {
    console.warn('[telegram-context] postStudio mirror fetch failed:', (err as Error).message);
  }

  let calendar: { summary: string; start: string }[] | null = null;
  try {
    calendar = await fetchUpcomingEvents(uid, db);
  } catch (err) {
    console.warn('[telegram-context] calendar fetch failed:', (err as Error).message);
  }

  return { arena, pendingReminders, postStudio, calendar };
}
