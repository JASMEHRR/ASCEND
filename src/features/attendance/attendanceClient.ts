/**
 * Attendance storage (client Firestore).
 *
 * Flat collection at `users/{uid}/attendance`, one doc per lesson-occurrence,
 * keyed `${lessonId}_${date}` so re-marking a day overwrites cleanly instead
 * of accumulating duplicates.
 */
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { AttendanceRecord, AttendanceStatus } from './types';

const colPath = (uid: string) => `users/${uid}/attendance`;
const recordId = (lessonId: string, date: string) => `${lessonId}_${date}`;

export async function setAttendance(uid: string, lessonId: string, date: string, status: AttendanceStatus): Promise<void> {
  const record: AttendanceRecord = { lessonId, date, status };
  await setDoc(doc(db, colPath(uid), recordId(lessonId, date)), record);
}

/** All records within [fromDate, toDate], both "YYYY-MM-DD" inclusive. */
export async function getAttendanceRange(uid: string, fromDate: string, toDate: string): Promise<AttendanceRecord[]> {
  const q = query(collection(db, colPath(uid)), where('date', '>=', fromDate), where('date', '<=', toDate));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as AttendanceRecord);
}
