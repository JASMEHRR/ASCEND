/**
 * Per-occurrence attendance against the weekly Timetable (see
 * ../timetable/types.ts). A lesson repeats every week; each week's actual
 * occurrence is marked separately, keyed by lesson + calendar date, because
 * "attended Monday's QTM" is a fact about 2026-09-15, not about Mondays.
 */
/**
 * 'did_not_happen' (class cancelled, holiday, etc.) is excluded from the
 * attendance percentage entirely — it isn't a miss, there was nothing to
 * attend, so counting it against you would understate real attendance.
 */
export type AttendanceStatus = 'attended' | 'not_attended' | 'did_not_happen';

export interface AttendanceRecord {
  lessonId: string;
  /** "YYYY-MM-DD", local calendar date of that occurrence. */
  date: string;
  status: AttendanceStatus;
}
