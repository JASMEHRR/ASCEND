import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { EMPTY_LAUNCH_STATE, type LaunchState } from './types';

/**
 * Owns the Launch feature's state and syncs it to `users/{uid}/launch/state` in
 * real time — the same offline-first, echo-guarded pattern as useCloudSync, on a
 * dedicated document so it stays independent of the daily OSState.
 */
export function useLaunchState(uid: string | null) {
  const [state, setState] = useState<LaunchState | null>(null);
  const lastSyncedRef = useRef('');

  useEffect(() => {
    const cacheKey = `ascend_launch_${uid ?? 'guest'}`;
    let seed: LaunchState = EMPTY_LAUNCH_STATE;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) seed = { ...EMPTY_LAUNCH_STATE, ...JSON.parse(cached) };
    } catch {
      /* ignore corrupt cache */
    }
    setState(seed);
    lastSyncedRef.current = '';

    if (!uid) return;

    const ref = doc(db, 'users', uid, 'launch', 'state');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const data = snap.data();
        if (!data) return;
        const merged = { ...EMPTY_LAUNCH_STATE, ...data } as LaunchState;
        lastSyncedRef.current = JSON.stringify(merged);
        setState(merged);
      },
      (err) => console.warn('[launch sync] listener error:', err.message),
    );
  }, [uid]);

  useEffect(() => {
    if (!state) return;
    const cacheKey = `ascend_launch_${uid ?? 'guest'}`;
    localStorage.setItem(cacheKey, JSON.stringify(state));

    if (!uid) return;
    const payload = JSON.stringify(state);
    if (payload === lastSyncedRef.current) return;

    const timeout = setTimeout(async () => {
      lastSyncedRef.current = payload;
      try {
        await setDoc(doc(db, 'users', uid, 'launch', 'state'), state);
      } catch (err) {
        console.warn('[launch sync] write failed:', (err as Error).message);
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [state, uid]);

  const update = useCallback((updater: (prev: LaunchState) => LaunchState) => {
    setState((prev) => (prev ? updater(prev) : prev));
  }, []);

  return { state, update };
}
