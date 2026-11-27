/**
 * Reels storage (client Firestore), `users/{uid}/reels/{id}`.
 *
 * Read-only from the browser: a live listener so reels Muse writes appear
 * without a refresh. There is no write function on purpose, and the rules
 * reject any write from a page.
 */
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { normalizeReel } from './logic';
import type { Reel } from './types';

export function subscribeReels(uid: string, onData: (items: Reel[]) => void, onError: (message: string) => void): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'reels'),
    (snap) => onData(snap.docs.map((d) => normalizeReel(d.id, d.data()))),
    (err) => {
      console.warn('[reels] listener error:', err.message);
      onError(err.code === 'permission-denied' ? "You don't have access to this library." : err.message);
    },
  );
}
