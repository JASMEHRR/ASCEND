/**
 * Maps a raw timetable subject string to the bucket Attendance actually
 * tracks against. Two adjustments on top of the raw subject name:
 *  - "Field Work" and "Free" aren't classes to attend — excluded entirely
 *    (returns null), so they never show a mark button and never enter stats.
 *  - SIP and its mentor meetings are the same commitment for attendance
 *    purposes, so they fold into one "SIP" bucket.
 *
 * Matched by pattern, not exact name: the real timetable reads "SiP-I" and
 * "SiP-I MENTOR MEETING", and an exact-string rule silently missed both.
 * Case-insensitive, since Gemini's photo reads and hand typing won't always
 * agree on casing.
 */
const EXCLUDED = /^(free|field work)\b/;
const SIP = /^sip\b|\bmentor meeting\b/;

export function attendanceSubject(rawSubject: string): string | null {
  const key = rawSubject.trim().toLowerCase();
  if (!key || EXCLUDED.test(key)) return null;
  if (SIP.test(key)) return 'SIP';
  return rawSubject.trim();
}
