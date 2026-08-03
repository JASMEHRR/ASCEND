import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { OSState } from '../types';

export const INITIAL_STATE: OSState = {
  lastVisit: todayStr(),
  water: 0,
  rituals: {},
  tasks: [],
  ideas: [],
  visionBoard: [],
  points: 0,
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** The exact subset of state persisted to Firestore, in a stable order. */
function syncPayload(s: OSState) {
  return {
    // users/{uid}
    tasks: s.tasks,
    ideas: s.ideas,
    visionBoard: s.visionBoard,
    points: s.points ?? 0,
    features: s.features ?? null,
    jarvisPrefs: s.jarvisPrefs ?? null,
    finance: s.finance ?? null,
    journal: s.journal ?? null,
    // users/{uid}/dailyStates/{today}
    water: s.water,
    rituals: s.rituals,
    weight: s.weight ?? null,
    streak: s.streak ?? 0,
    streakDate: s.streakDate ?? null,
    primaryObjective: s.primaryObjective ?? null,
  };
}

const serialize = (s: OSState) => JSON.stringify(syncPayload(s));

/** Award points for newly-completed items (never for un-completing). */
function accruePoints(prev: OSState, next: OSState): number {
  let gained = 0;
  if (next.water > prev.water) gained += next.water - prev.water;

  const doneDelta = (a: Record<string, boolean>, b: Record<string, boolean>) =>
    Object.values(b).filter(Boolean).length - Object.values(a).filter(Boolean).length;
  gained += Math.max(0, doneDelta(prev.rituals, next.rituals));

  const tasksDelta = next.tasks.filter((t) => t.done).length - prev.tasks.filter((t) => t.done).length;
  gained += Math.max(0, tasksDelta);

  if (next.primaryObjective?.done && !prev.primaryObjective?.done) gained += 2;
  return gained;
}

export interface CloudSync {
  state: OSState | null;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

/**
 * Owns the app's daily state and keeps it in sync with Firestore in real time.
 *
 * - Seeds instantly from a per-user localStorage cache (offline-first).
 * - Subscribes to `users/{uid}` and `users/{uid}/dailyStates/{today}` via
 *   onSnapshot so edits on one device appear on others.
 * - Debounced writes back to Firestore; an echo-guard (`lastSyncedRef`) prevents
 *   the snapshot→write→snapshot feedback loop.
 */
export function useCloudSync(uid: string | null): CloudSync {
  const [state, setState] = useState<OSState | null>(null);
  const lastSyncedRef = useRef<string>('');

  // Seed from cache + subscribe to remote docs whenever the user changes.
  useEffect(() => {
    const cacheKey = uid ? `ascend_state_${uid}` : 'ascend_state_guest';

    let seed: OSState = INITIAL_STATE;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) seed = { ...INITIAL_STATE, ...JSON.parse(cached) };
    } catch {
      /* ignore corrupt cache */
    }
    setState({ ...seed, lastVisit: todayStr() });
    lastSyncedRef.current = '';

    if (!uid) return;

    const userRef = doc(db, 'users', uid);
    const dailyRef = doc(db, 'users', uid, 'dailyStates', todayStr());

    let latestUser: DocumentData = {};
    let latestDaily: DocumentData = {};

    const mergeRemote = () => {
      setState((prev) => {
        const base = prev ?? INITIAL_STATE;
        const merged: OSState = {
          ...base,
          tasks: latestUser.tasks ?? base.tasks,
          ideas: latestUser.ideas ?? base.ideas,
          visionBoard: latestUser.visionBoard ?? base.visionBoard,
          points: latestUser.points ?? base.points,
          features: latestUser.features ?? base.features,
          jarvisPrefs: latestUser.jarvisPrefs ?? base.jarvisPrefs,
          finance: latestUser.finance ?? base.finance,
          journal: latestUser.journal ?? base.journal,
          water: latestDaily.water ?? base.water,
          rituals: latestDaily.rituals ?? base.rituals,
          weight: latestDaily.weight ?? base.weight,
          streak: latestUser.streak ?? base.streak,
          streakDate: latestUser.streakDate ?? base.streakDate,
          primaryObjective: latestDaily.primaryObjective ?? base.primaryObjective,
          lastVisit: todayStr(),
        };
        lastSyncedRef.current = serialize(merged);
        return merged;
      });
    };

    // Ignore snapshots from our own not-yet-acknowledged writes to avoid clobbering.
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        latestUser = snap.data() ?? {};
        mergeRemote();
      },
      (err) => console.warn('[sync] user doc listener error:', err.message),
    );

    const unsubDaily = onSnapshot(
      dailyRef,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        latestDaily = snap.data() ?? {};
        mergeRemote();
      },
      (err) => console.warn('[sync] daily doc listener error:', err.message),
    );

    return () => {
      unsubUser();
      unsubDaily();
    };
  }, [uid]);

  // Persist local changes: always to the cache, debounced to Firestore.
  useEffect(() => {
    if (!state) return;

    const cacheKey = uid ? `ascend_state_${uid}` : 'ascend_state_guest';
    localStorage.setItem(cacheKey, JSON.stringify(state));

    if (!uid) return;

    const payload = serialize(state);
    if (payload === lastSyncedRef.current) return; // nothing new / avoids echo

    const timeout = setTimeout(async () => {
      lastSyncedRef.current = payload;
      const p = syncPayload(state);
      try {
        await setDoc(
          doc(db, 'users', uid),
          { tasks: p.tasks, ideas: p.ideas, visionBoard: p.visionBoard, points: p.points, streak: p.streak, streakDate: p.streakDate, features: p.features, jarvisPrefs: p.jarvisPrefs, finance: p.finance, journal: p.journal },
          { merge: true },
        );
        await setDoc(
          doc(db, 'users', uid, 'dailyStates', todayStr()),
          {
            water: p.water,
            rituals: p.rituals,
            weight: p.weight,
            primaryObjective: p.primaryObjective,
          },
          { merge: true },
        );
      } catch (err) {
        console.warn('[sync] write failed (offline or rules):', (err as Error).message);
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [state, uid]);

  const updateState = useCallback((updater: (prev: OSState) => OSState) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      const gained = accruePoints(prev, next);
      return gained > 0 ? { ...next, points: (next.points ?? 0) + gained } : next;
    });
  }, []);

  return { state, updateState };
}
