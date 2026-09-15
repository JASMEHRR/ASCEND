/**
 * "HH:MM" (24h) -> 12-hour display, e.g. "09:00" -> "9:00 AM".
 *
 * Storage and native <input type="time"> stay 24-hour ("HH:MM") — that's
 * required for string-sort ordering and is what the input element needs
 * regardless of locale. This only governs what the user reads.
 */
/** Local "YYYY-MM-DD" — en-CA formats as ISO order without a UTC shift. */
export function toDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

export function to12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
