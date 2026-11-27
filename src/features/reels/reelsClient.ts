/**
 * Reels storage (client Firestore), `users/{uid}/reels/{id}`.
 *
 * A live listener so reels Muse writes appear without a refresh. The page
 * can do exactly two writes: flip `archived` (updateDoc with that one field,
 * so Muse's fields are never touched) and delete a reel. firestore.rules
 * rejects anything wider, and never allows create.
 */
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
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

export async function setReelArchived(uid: string, id: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'reels', id), { archived });
}

export async function deleteReel(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'reels', id));
}
