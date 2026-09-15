/**
 * Maps a raw timetable subject string to the bucket Attendance actually
 * tracks against. Two adjustments on top of the raw subject name:
 *  - "Field Work" and "Free" aren't classes to attend — excluded entirely
 *    (returns null), so they never show a mark button and never enter stats.
 *  - "SIP" and "Mentor Meeting" are the same commitment for attendance
 *    purposes, so both fold into one "SIP" bucket.
 * Case-insensitive, since Gemini's photo reads and hand typing won't always
 * agree on casing.
 */
const EXCLUDED = new Set(['field work', 'free']);
const ALIASES: Record<string, string> = {
  'mentor meeting': 'SIP',
  sip: 'SIP',
};

export function attendanceSubject(rawSubject: string): string | null {
  const key = rawSubject.trim().toLowerCase();
  if (!key || EXCLUDED.has(key)) return null;
  return ALIASES[key] ?? rawSubject.trim();
}
