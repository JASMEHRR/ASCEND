import { useCallback, useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Exact shape the desktop Jarvis app writes to `users/{uid}/reminders` — do not change. */
export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  done: boolean;
  notified: boolean;
  createdAt: string;
  source: 'desktop' | 'web';
}

export interface RemindersApi {
  pending: Reminder[];
  addReminder: (text: string, dueAtISO: string) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
}

// setTimeout delays are a 32-bit signed int; anything past this fires immediately due to overflow.
const MAX_TIMEOUT_MS = 2_147_483_000;

function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {
      /* ignore — falls back to console alert */
    });
  }
}

/**
 * Reminders are a separate Firestore collection with their own onSnapshot
 * listener — deliberately independent of useCloudSync/updateState so the
 * OSState sync payload never sees them. Mirrors the desktop app: schedules
 * in-browser alerts for pending, not-yet-notified reminders and flips
 * `notified` once fired.
 */
export function useReminders(uid: string | null): RemindersApi {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  // ponytail: only schedules alerts due within ~24 days (setTimeout's int32 cap);
  // farther-out reminders get picked up on next reload/reminders change.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!uid) {
      setReminders([]);
      return;
    }
    const q = query(collection(db, 'users', uid, 'reminders'), orderBy('dueAt'));
    const unsub = onSnapshot(
      q,
      (snap) => setReminders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reminder, 'id'>) }))),
      (err) => console.warn('[reminders] listener error:', err.message),
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    const timers = timersRef.current;
    if (!uid) {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      return;
    }

    const active = new Set<string>();
    for (const r of reminders) {
      if (r.done || r.notified) continue;
      const delay = new Date(r.dueAt).getTime() - Date.now();
      if (Number.isNaN(delay) || delay > MAX_TIMEOUT_MS) continue;
      active.add(r.id);
      if (timers.has(r.id)) continue;

      requestNotificationPermission();
      const fire = () => {
        timers.delete(r.id);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Ascend reminder', { body: r.text });
        } else {
          console.warn('[reminders] due:', r.text);
        }
        updateDoc(doc(db, 'users', uid, 'reminders', r.id), { notified: true }).catch((err) =>
          console.warn('[reminders] failed to mark notified:', (err as Error).message),
        );
      };
      timers.set(r.id, setTimeout(fire, Math.max(0, delay)));
    }

    for (const [id, t] of timers) {
      if (!active.has(id)) {
        clearTimeout(t);
        timers.delete(id);
      }
    }
  }, [reminders, uid]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const addReminder = useCallback(
    async (text: string, dueAtISO: string) => {
      if (!uid) return;
      try {
        await addDoc(collection(db, 'users', uid, 'reminders'), {
          text,
          dueAt: dueAtISO,
          done: false,
          notified: false,
          createdAt: new Date().toISOString(),
          source: 'web',
        });
      } catch (err) {
        console.warn('[reminders] add failed:', (err as Error).message);
      }
    },
    [uid],
  );

  const completeReminder = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await updateDoc(doc(db, 'users', uid, 'reminders', id), { done: true });
      } catch (err) {
        console.warn('[reminders] complete failed:', (err as Error).message);
      }
    },
    [uid],
  );

  const deleteReminder = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await deleteDoc(doc(db, 'users', uid, 'reminders', id));
      } catch (err) {
        console.warn('[reminders] delete failed:', (err as Error).message);
      }
    },
    [uid],
  );

  const pending = reminders.filter((r) => !r.done);

  return { pending, addReminder, completeReminder, deleteReminder };
}
