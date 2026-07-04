/** Local calendar-day helpers (YYYY-MM-DD). */
export function todayStr(d = new Date()): string {
  return d.toISOString().split('T')[0];
}

export function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}
