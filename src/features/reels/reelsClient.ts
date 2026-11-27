/**
 * Reels storage (client Firestore), `users/{uid}/reels/{id}`.
 *
 * A live listener so reels Muse writes appear without a refresh. The page
 * can do exactly two writes: flip `archived` (updateDoc with that one field,
 * so Muse's fields are never touched) and delete a reel. firestore.rules
 * rejects anything wider, and never allows create.
 */
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cleanCatName, normalizeCategory, normalizeDivisionSides, normalizeReel } from './logic';
import type { DivisionSides, Reel, ReelBucket, ReelCategory, Side } from './types';

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

// --- JasMehr's own categories and Work/Personal (app-owned; Muse never writes these) ---

const catsCol = (uid: string) => collection(db, 'users', uid, 'reelCats');
const sidesDoc = (uid: string) => doc(db, 'users', uid, 'reelPrefs', 'sides');

export function subscribeCategories(uid: string, onData: (cats: ReelCategory[]) => void, onError: (message: string) => void): () => void {
  return onSnapshot(
    catsCol(uid),
    (snap) => onData(snap.docs.map((d) => normalizeCategory(d.id, d.data()))),
    (err) => {
      console.warn('[reels] categories listener error:', err.message);
      onError(err.message);
    },
  );
}

export function subscribeDivisionSides(uid: string, onData: (sides: DivisionSides) => void): () => void {
  return onSnapshot(
    sidesDoc(uid),
    (snap) => onData(normalizeDivisionSides(snap.data())),
    (err) => console.warn('[reels] sides listener error:', err.message),
  );
}

/** Creates a category, optionally with reels already in it; returns its id. */
export async function createCategory(uid: string, name: string, side: Side, reelIds: string[] = []): Promise<string> {
  const clean = cleanCatName(name);
  if (!clean) throw new Error('Give the category a name.');
  const ref = await addDoc(catsCol(uid), { name: clean, side, reelIds: [...new Set(reelIds)], createdAt: new Date().toISOString() });
  return ref.id;
}

export async function setCategorySide(uid: string, id: string, side: Side): Promise<void> {
  await updateDoc(doc(catsCol(uid), id), { side });
}

export async function renameCategory(uid: string, id: string, name: string): Promise<void> {
  const clean = cleanCatName(name);
  if (!clean) throw new Error('Give the category a name.');
  await updateDoc(doc(catsCol(uid), id), { name: clean });
}

/** Deletes the category only; the reels in it are untouched. */
export async function deleteCategory(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(catsCol(uid), id));
}

/** Puts reels into a category (on) or takes them out (off). */
export async function setReelsInCategory(uid: string, id: string, reelIds: string[], on: boolean): Promise<void> {
  if (reelIds.length === 0) return;
  await updateDoc(doc(catsCol(uid), id), { reelIds: on ? arrayUnion(...reelIds) : arrayRemove(...reelIds) });
}

export async function setDivisionSide(uid: string, bucket: ReelBucket, side: Side): Promise<void> {
  await setDoc(sidesDoc(uid), { [bucket]: side }, { merge: true });
}
