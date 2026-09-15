/**
 * Timetable storage (client Firestore) and the photo-parsing round trip.
 *
 * The doc lives at `users/{uid}/timetable/main` — one doc, not a subcollection
 * per lesson, because it's always read and written as a whole (see types.ts).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Lesson, Timetable } from './types';

const path = (uid: string) => `users/${uid}/timetable/main`;

export async function getTimetable(uid: string): Promise<Timetable | null> {
  const snap = await getDoc(doc(db, path(uid)));
  return snap.exists() ? (snap.data() as Timetable) : null;
}

export async function saveTimetable(uid: string, lessons: Lesson[], timeZone: string): Promise<void> {
  await setDoc(doc(db, path(uid)), { lessons, timeZone, updatedAt: new Date().toISOString() });
}

/**
 * Send a photo to the server for Gemini to read into structured lessons. The
 * server never touches Firestore for this — parsing is stateless, the same
 * shape as transcribe-routes.ts, and the caller decides whether to save what
 * comes back (the UI shows it for review first; a misread subject is cheap to
 * fix by hand, a silent wrong save is not).
 */
export async function parseTimetableImage(dataUrl: string): Promise<Lesson[]> {
  const [, base64] = dataUrl.split(',', 2);
  const mime = /^data:([^;]+);/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  if (!base64) throw new Error('Could not read that image.');

  const res = await fetch('/api/timetable/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, mimeType: mime }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Parsing failed (${res.status}).`);
  const lessons = Array.isArray(data?.lessons) ? (data.lessons as Lesson[]) : [];
  return lessons.map((l, i) => ({ ...l, id: `l${i}` }));
}
