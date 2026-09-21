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

/** How far `timeZone` is ahead of UTC at `at`, in ms (IST: +19,800,000). */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const n = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value);
  const wallAsUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/**
 * Parses a datetime, reading one WITHOUT an offset as wall-clock time in
 * `timeZone`. `new Date("2026-09-21T10:25:00")` would read it in the host's
 * zone instead, and on Vercel that is UTC, so "remind me at 10:25" became
 * 3:55 PM IST. Strings that carry Z or an offset are taken as given.
 * Returns null when the string isn't a datetime.
 */
export function parseInZone(text: string, timeZone: string): Date | null {
  const s = text.trim();
  const m = LOCAL_DATETIME.exec(s);
  if (!m) {
    const d = new Date(s);
    return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && !Number.isNaN(d.getTime()) ? d : null;
  }
  const [, y, mo, d, h, mi, sec] = m.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, sec || 0);
  // Two passes so a DST change between the guess and the answer still lands.
  let utc = wall - zoneOffsetMs(timeZone, new Date(wall));
  utc = wall - zoneOffsetMs(timeZone, new Date(utc));
  return new Date(utc);
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
