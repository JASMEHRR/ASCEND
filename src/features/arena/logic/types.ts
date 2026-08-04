/**
 * Arena — the shared habit board.
 *
 * The model in one paragraph: every habit completion earns exactly one tile.
 * Tiles are a wallet, not a schedule — you spend them on any week's picture,
 * including old unfinished ones, so a strong week can repair a bad one. Tiles
 * placed after their own week are marked as repairs, so the record stays
 * honest even though it's recoverable. There are no per-habit point values;
 * the only score is tiles placed.
 */

/** A day key, 'YYYY-MM-DD' in the player's local timezone. */
export type DayKey = string;

/** A week key, 'YYYY-Www' (ISO week), e.g. '2026-W31'. */
export type WeekKey = string;

export type HabitKind = 'good' | 'bad';

/**
 * How a bad habit scores.
 *   reward_avoid — earn a tile when you explicitly log it avoided
 *   penalty_do   — no tile, and doing it burns a miss
 *   both         — earn when avoided, burn a miss when done
 */
export type BadMode = 'reward_avoid' | 'penalty_do' | 'both';

export interface Habit {
  id: string;
  playerId: string;
  label: string;
  kind: HabitKind;
  /** Lucide icon name, auto-matched from the label at creation. */
  icon: string;
  color: string;
  badMode?: BadMode;
  /**
   * The habit's *name* is hidden from the room — not the habit. Others still
   * see the slot, its icon and colour, and whether you did it today; they just
   * see "Private habit" instead of the label. So the board stays fully legible
   * (8 habits, 6 done) while what you're working on stays yours.
   * Changeable at any time.
   */
  private?: boolean;
  /** Counter habits need N reps to count as done (e.g. 8 glasses). Default 1. */
  target?: number;
  /** Unit label for counter habits, e.g. 'glasses', 'hours'. */
  unit?: string;
  /** ISO timestamp the habit became active. Days before this never count. */
  startsAt: string;
  /**
   * Optional planned expiry. An expired habit stops earning tiles but is NOT
   * a removal — it carries no penalty, because it was declared up front.
   */
  expiresAt?: string;
  /**
   * Set when the player removes a habit mid-week. Removal only takes effect at
   * week end; until then the habit still counts. The following week's canvas
   * grows by REMOVAL_PENALTY_TILES as the cost of removing it.
   */
  removedAt?: string;
  createdAt: string;
}

export interface Entry {
  id: string;
  habitId: string;
  playerId: string;
  day: DayKey;
  /** Reps logged. For a simple habit, 1 = done. */
  value: number;
  at: string;
}

/** Where a tile came from and where it landed. */
export interface TilePlacement {
  /** Index into the week's grid. */
  index: number;
  /** The week whose picture this tile was placed on. */
  week: WeekKey;
  /** The day whose work earned the tile. */
  earnedOn: DayKey;
  /**
   * True when the tile was placed on a week other than the one it was earned
   * in — a repair. Rendered differently so a patched week reads as patched.
   */
  repair: boolean;
  at: string;
  /**
   * Who earned this tile. Only meaningful on a shared room canvas, where one
   * picture holds placements from every member — absent on a solo canvas,
   * where every placement is implicitly the owner's.
   */
  playerId?: string;
}

export interface PuzzleWeek {
  week: WeekKey;
  playerId: string;
  /** Image source — a pasted URL or an uploaded object URL. */
  imageUrl: string;
  /** Grid dimensions, derived from the week's projected tile count. */
  cols: number;
  rows: number;
  placements: TilePlacement[];
  /** The player chose to reveal the finished image to the room. */
  revealed: boolean;
  /**
   * A shared puzzle: two players, one canvas, half each. `sharedWith` is the
   * other player's id; each half completes independently, so one person
   * slacking leaves their own half visibly unfinished rather than blocking
   * the whole image.
   */
  sharedWith?: string;
  createdAt: string;
}

/** The running tile balance for one player. */
export interface TileWallet {
  /** Tiles earned across all time. */
  earned: number;
  /** Tiles placed on any canvas. */
  placed: number;
  /** Unspent tiles, available for this week or to repair an old one. */
  available: number;
}

export interface Player {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  avatar: string;
  joinedAt: string;
}

export interface Room {
  id: string;
  /** 6-char invite code, excluding 0/O/1/I. */
  code: string;
  name: string;
  createdBy: string;
  createdAt: string;
  /**
   * Whether the weekly puzzle is per-member ('solo', the default) or one
   * shared canvas the whole room fills together ('shared'). Set by the
   * creator in Arena → Settings. Missing on older rooms, which means solo.
   */
  puzzleMode?: 'solo' | 'shared';
}
