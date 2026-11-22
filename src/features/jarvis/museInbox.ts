/**
 * Copies a task to Muse: one doc in the signed-in user's own
 * users/{uid}/coach-inbox. Muse polls it, does the task on its side and
 * closes the doc itself (status "processed"); Jarvis never reads it back.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export type MuseChannel = 'app-voice' | 'app-text';

/** True once Firestore has the doc; false (logged) if the write failed. */
export async function mirrorToMuse(uid: string, text: string, channel: MuseChannel): Promise<boolean> {
  try {
    await addDoc(collection(db, 'users', uid, 'coach-inbox'), {
      text,
      createdAt: serverTimestamp(),
      status: 'pending',
      channel,
    });
    return true;
  } catch (err) {
    console.warn('[muse] could not copy task to coach-inbox:', (err as Error).message);
    return false;
  }
}
