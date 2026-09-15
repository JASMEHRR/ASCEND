/**
 * Step sizes for counter habits.
 *
 * The +/- pair was built when counters meant "8 glasses of water", where
 * stepping by one is exactly right. It stops being right the moment a target
 * is 5000 steps or 60 minutes: a fixed step of one turns logging a day into
 * thousands of taps, and a habit that is tedious to log is a habit that stops
 * being logged. The step scales with the target instead, so filling any
 * counter by hand stays within about a dozen presses.
 */

/** How much one press of +/- moves a counter with this target. */
export function stepFor(target: number): number {
  if (!Number.isFinite(target) || target <= 10) return 1;
  if (target <= 60) return 5;
  if (target <= 200) return 10;
  if (target <= 2000) return 100;
  return 500;
}

/**
 * The value a press lands on, kept inside 0..target.
 *
 * Stepping snaps to the step grid rather than adding blindly: from 5412 steps
 * a press of minus should offer 5000, not 4912, so the number stays round
 * enough to read at a glance after an exact value has been typed in.
 */
export function stepped(current: number, target: number, direction: 1 | -1): number {
  const step = stepFor(target);
  const onGrid = current % step === 0;
  const next =
    direction === 1
      ? (onGrid ? current + step : Math.ceil(current / step) * step)
      : (onGrid ? current - step : Math.floor(current / step) * step);
  return Math.max(0, Math.min(next, target));
}
