/**
 * Shared privacy-lock hook for sensitive vaults (Purchases, Stocks).
 *
 * Stores only a SHA-256 hash of the PIN (see passcode.ts). Handles first-time
 * set vs. subsequent unlock, one-time migration of a legacy *plaintext* passcode
 * to a hash, a 5-minute idle auto-relock, and re-lock on unmount (so switching
 * views always re-locks — the component simply unmounts).
 *
 * localStorage access here is a sanctioned exception to the "all state through
 * updateState" rule: PIN material must never sync to the cloud.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { hashPasscode, verifyPasscode } from './passcode';

const IDLE_MS = 5 * 60 * 1000;

export type LockStatus = 'loading' | 'setup' | 'locked' | 'unlocked';

interface Options {
  /** localStorage key holding the SHA-256 hash. Namespaced per user + vault. */
  hashKey: string;
  /** Optional legacy key holding a plaintext passcode to migrate once. */
  legacyPlainKey?: string;
  /** Owner uid — used as the hash salt. */
  uid: string | null;
}

export interface PasscodeLock {
  status: LockStatus;
  error: string;
  /** Submit a code: sets it in setup mode, or verifies it when locked. */
  submit: (code: string) => Promise<void>;
  /** Clear the stored passcode and return to setup. */
  reset: () => void;
  /** Manually re-lock (without clearing the passcode). */
  relock: () => void;
}

export function usePasscodeLock({ hashKey, legacyPlainKey, uid }: Options): PasscodeLock {
  const [status, setStatus] = useState<LockStatus>('loading');
  const [error, setError] = useState('');
  const idleTimer = useRef<number | null>(null);

  // Load the stored hash (migrating any legacy plaintext once) when the user changes.
  useEffect(() => {
    setError('');
    if (!uid) {
      setStatus('loading');
      return;
    }
    let stored = localStorage.getItem(hashKey);
    if (!stored && legacyPlainKey) {
      const legacy = localStorage.getItem(legacyPlainKey);
      if (legacy) {
        // Migrate plaintext -> hash once, then drop the plaintext value.
        hashPasscode(legacy, uid).then((h) => {
          localStorage.setItem(hashKey, h);
          localStorage.removeItem(legacyPlainKey);
        });
        stored = 'pending-migration';
      }
    }
    setStatus(stored ? 'locked' : 'setup');
  }, [hashKey, legacyPlainKey, uid]);

  const relock = useCallback(() => {
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
    setError('');
  }, []);

  // 5-minute idle auto-relock, reset on user activity while unlocked.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const arm = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(relock, IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'pointermove'];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      events.forEach((e) => window.removeEventListener(e, arm));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [status, relock]);

  const submit = useCallback(
    async (code: string) => {
      if (!uid) return;
      const trimmed = code.trim();
      if (status === 'setup') {
        if (trimmed.length < 4) {
          setError('Passcode must be at least 4 characters.');
          return;
        }
        const h = await hashPasscode(trimmed, uid);
        localStorage.setItem(hashKey, h);
        setError('');
        setStatus('unlocked');
        return;
      }
      // locked
      const stored = localStorage.getItem(hashKey);
      if (stored && (await verifyPasscode(trimmed, uid, stored))) {
        setError('');
        setStatus('unlocked');
      } else {
        setError('Incorrect passcode.');
      }
    },
    [status, hashKey, uid],
  );

  const reset = useCallback(() => {
    localStorage.removeItem(hashKey);
    setError('');
    setStatus('setup');
  }, [hashKey]);

  return { status, error, submit, reset, relock };
}
