/**
 * A weekly, recurring class schedule — distinct from Reminders (one-shot,
 * absolute `dueAt`) because a lesson repeats every week on the same weekday
 * and clock time. Stored as a single doc, not a subcollection: a timetable is
 * small (a dozen-ish lessons) and always read/written whole.
 */

/** 0 = Sunday, matching Date#getDay() and Intl's weekday numbering. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Lesson {
  /** Stable within one timetable — index-derived, not a random id (see save). */
  id: string;
  day: Weekday;
  /** "HH:MM", 24-hour. */
  start: string;
  /** "HH:MM", 24-hour. Purely informational — alerts fire off `start` only. */
  end: string;
  subject: string;
  room?: string;
}

export interface Timetable {
  lessons: Lesson[];
  /** IANA zone the times are in, e.g. "Asia/Kolkata" — the cron has no browser to infer one from. */
  timeZone: string;
  updatedAt: string;
}
