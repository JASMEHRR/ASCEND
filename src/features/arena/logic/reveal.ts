/**
 * Arena — tile reveal order and placement.
 *
 * Tiles are never revealed randomly. The order spirals outward from the centre
 * of the image, so the subject resolves before the edges do: by midweek you
 * can tell what the picture is, which is the pull that carries you through the
 * back half of the week. A left-to-right or random fill gives you nothing to
 * look at until it's nearly finished.
 */
import type { DayKey, TilePlacement, WeekKey } from './types';
import { weekKey } from './dates';

/**
 * Grid indices ordered by distance from the centre, nearest first.
 *
 * Ties (cells equidistant from the centre) break by angle, so equal rings fill
 * in a consistent sweep rather than a jitter that reads as random.
 */
export function revealOrder(cols: number, rows: number): number[] {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const cells: { i: number; d: number; a: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = c - cx;
      const dy = r - cy;
      cells.push({ i: r * cols + c, d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) });
    }
  }
  cells.sort((p, q) => p.d - q.d || p.a - q.a);
  return cells.map((c) => c.i);
}

/**
 * The next unfilled slot on a canvas, in reveal order.
 * Returns null when the picture is complete.
 */
export function nextSlot(
  cols: number,
  rows: number,
  placements: TilePlacement[],
): number | null {
  const taken = new Set(placements.map((p) => p.index));
  const order = revealOrder(cols, rows);
  return order.find((i) => !taken.has(i)) ?? null;
}

/**
 * Place one earned tile on a canvas.
 *
 * A tile earned in a different week than the canvas it lands on is a *repair*
 * — the placement is flagged, and the UI marks those tiles so a patched week
 * still reads as patched. Recoverable, but honest.
 */
export function placeTile(
  canvas: { week: WeekKey; cols: number; rows: number; placements: TilePlacement[] },
  earnedOn: DayKey,
  at: string = new Date().toISOString(),
): TilePlacement | null {
  const index = nextSlot(canvas.cols, canvas.rows, canvas.placements);
  if (index === null) return null;
  return {
    index,
    week: canvas.week,
    earnedOn,
    repair: weekKey(earnedOn) !== canvas.week,
    at,
  };
}

/** Is this canvas finished? */
export function isComplete(cols: number, rows: number, placements: TilePlacement[]): boolean {
  return placements.length >= cols * rows;
}

/** Completion as a 0–1 fraction, for progress rings and the room view. */
export function progress(cols: number, rows: number, placements: TilePlacement[]): number {
  const total = cols * rows;
  return total === 0 ? 0 : Math.min(1, placements.length / total);
}

/**
 * A shared canvas is split down the middle: the owner fills the left half,
 * `sharedWith` the right. Each half completes independently, so one person
 * going quiet leaves their own side visibly unfinished instead of holding the
 * whole picture hostage.
 */
export function halfFor(
  side: 'owner' | 'guest',
  cols: number,
  rows: number,
): number[] {
  const mid = Math.floor(cols / 2);
  const out: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isLeft = c < mid;
      if ((side === 'owner') === isLeft) out.push(r * cols + c);
    }
  }
  return out;
}

/** Next slot within one half of a shared canvas. */
export function nextSlotInHalf(
  side: 'owner' | 'guest',
  cols: number,
  rows: number,
  placements: TilePlacement[],
): number | null {
  const mine = new Set(halfFor(side, cols, rows));
  const taken = new Set(placements.map((p) => p.index));
  const order = revealOrder(cols, rows).filter((i) => mine.has(i));
  return order.find((i) => !taken.has(i)) ?? null;
}
