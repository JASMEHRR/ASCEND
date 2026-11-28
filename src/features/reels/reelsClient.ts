/**
 * Reels storage (client Firestore), `users/{uid}/reels/{id}`.
 *
 * A live listener so reels Muse writes appear without a refresh. The page
 * can only: flip `archived`, send a reel back for re-evaluation (`isBS` off,
 * `reevalRequested` on, `reevalRequestedAt` = server time), and delete a reel.
 * Each is an updateDoc of just those fields, so Muse's fields are never
 * touched; firestore.rules rejects anything wider and never allows create.
 */
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cleanCatName, normalizeCategory, normalizeDivisionSides, normalizeReel } from './logic';
import type { DivisionSides, LifeSide, Reel, ReelBucket, ReelCategory, Side } from './types';

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

/** "Not BS — re-evaluate": un-flags the reel and puts it in Muse's re-check queue. */
export async function requestReeval(uid: string, id: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'reels', id), { isBS: false, reevalRequested: true, reevalRequestedAt: serverTimestamp() });
}

/**
 * "Implement": a task in Muse's inbox (users/{uid}/coach-inbox, same shape as
 * Jarvis's mirror) asking Muse to do what the reel shows. Muse closes it.
 */
export async function sendImplementTask(uid: string, reelId: string, text: string): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'coach-inbox'), {
    text,
    task: 'Implement what this reel shows for JasMehr, safely, then report back.',
    kind: 'implement-reel',
    reelId,
    channel: 'app-text',
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export interface ImplementState {
  /** Muse closed the task (status "processed" or "done"). */
  done: boolean;
  /** When it was sent, ISO. */
  at: string | null;
}

/**
 * Which reels were sent to Muse with "Implement", read from the Implement
 * tasks in coach-inbox (a filtered query, not a full read). The latest task
 * per reel wins.
 */
export function subscribeImplemented(uid: string, onData: (m: Map<string, ImplementState>) => void): () => void {
  return onSnapshot(
    query(collection(db, 'users', uid, 'coach-inbox'), where('kind', '==', 'implement-reel')),
    (snap) => {
      const m = new Map<string, ImplementState>();
      for (const d of snap.docs) {
        const x = d.data();
        if (typeof x.reelId !== 'string') continue;
        const ts = x.createdAt as { toDate?: () => Date } | undefined;
        const at = ts?.toDate ? ts.toDate().toISOString() : null;
        const prev = m.get(x.reelId);
        if (prev && prev.at && at && prev.at > at) continue;
        m.set(x.reelId, { done: x.status === 'processed' || x.status === 'done', at });
      }
      onData(m);
    },
    (err) => console.warn('[reels] implemented listener error:', err.message),
  );
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

/** Makes one of the built-in Claude sections under its fixed id (merge, so reels already in it stay). */
export async function ensurePurpose(uid: string, id: string, name: string, side: Side): Promise<void> {
  await setDoc(doc(catsCol(uid), id), { name, side, kind: 'purpose', createdAt: new Date().toISOString() }, { merge: true });
}

export async function setDivisionSide(uid: string, bucket: ReelBucket, side: LifeSide): Promise<void> {
  await setDoc(sidesDoc(uid), { [bucket]: side }, { merge: true });
}
