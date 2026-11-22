/**
 * Internships storage (client Firestore), `users/{uid}/internships/{slug}`.
 *
 * Read live with a listener so entries Muse adds or updates appear without a
 * refresh. Writes are narrow on purpose: one of `status` or `notes`, always
 * with `updatedAt`, via updateDoc so no other field is ever touched. The
 * rules reject anything wider, and never allow create or delete from here.
 *
 * Firestore applies local writes to the listener immediately, which is the
 * optimistic update; a rejected write rolls the snapshot back on its own.
 */
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { normalizeInternship } from './logic';
import type { Internship, InternshipPatch } from './types';

const colRef = (uid: string) => collection(db, 'users', uid, 'internships');

export const NOTES_MAX = 5000;

export function subscribeInternships(
  uid: string,
  onData: (items: Internship[]) => void,
  onError: (message: string) => void,
): () => void {
  return onSnapshot(
    colRef(uid),
    (snap) => onData(snap.docs.map((d) => normalizeInternship(d.id, d.data()))),
    (err) => {
      console.warn('[internships] listener error:', err.message);
      onError(err.code === 'permission-denied' ? "You don't have access to these internships." : err.message);
    },
  );
}

export async function updateInternship(uid: string, id: string, patch: InternshipPatch): Promise<void> {
  if ('notes' in patch && patch.notes.length > NOTES_MAX) {
    throw new Error(`Notes are limited to ${NOTES_MAX} characters.`);
  }
  await updateDoc(doc(db, 'users', uid, 'internships', id), { ...patch, updatedAt: new Date().toISOString() });
}
