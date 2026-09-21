/** Local "YYYY-MM-DD" — en-CA formats as ISO order without a UTC shift. */
export function toDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/**
 * "HH:MM" (24h) -> 12-hour display, e.g. "09:00" -> "9:00 AM".
 *
 * Storage and native <input type="time"> stay 24-hour ("HH:MM") — that's
 * required for string-sort ordering and is what the input element needs
 * regardless of locale. This only governs what the user reads.
 */
export function to12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "HH:MM" -> minutes since midnight; NaN when malformed. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface LocalClock {
  /** "YYYY-MM-DD" in the given zone — the same day key Arena uses. */
  dateKey: string;
  /** 0 = Sunday, matching Date#getDay() and the timetable's Weekday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

const WEEKDAY_NUM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Wall-clock time in an IANA zone, for code (the server cron) whose own clock
 * is UTC. hourCycle h23 rather than hour12:false: some engines render
 * midnight as "24" under hour12:false. Throws RangeError on an unknown zone.
 */
export function localClock(timeZone: string, now: Date = new Date()): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAY_NUM[get('weekday')] ?? now.getUTCDay(),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}
