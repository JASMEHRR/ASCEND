/**
 * Arena — Firestore layout.
 *
 * Firestore has no joins, so the shape here is driven by how Arena actually
 * reads: always "one room, this week". Nesting by room and player makes that a
 * single subtree fetch instead of a fan-out of reference lookups.
 *
 *   arenaRooms/{roomId}
 *     code, name, createdBy, createdAt
 *     players/{playerId}                 playerId === Firebase uid
 *       name, avatar, joinedAt
 *       habits/{habitId}                 label, kind, icon, colour, target…
 *       days/{YYYY-MM-DD}                ONE doc per player per day
 *         values: { [habitId]: number }
 *       weeks/{YYYY-Www}                 the puzzle canvas for that week
 *         imageUrl, cols, rows, placements[], revealed, sharedWith
 *     messages/{messageId}               room chat, batched per player per day
 *
 * The deliberate choice is `days/{date}` holding every habit value for that
 * day in one document, rather than a document per individual tick. A room of
 * six people over a week is ~42 reads instead of hundreds, which keeps a busy
 * room inside Firestore's 50k/day free tier. The tradeoff is that two ticks
 * racing on the same day touch one document — handled with atomic field
 * updates, so concurrent writes to different habits don't clobber each other.
 */

import type { TilePlacement } from '../logic/types';

export const ROOMS = 'arenaRooms';

/** A placement as stored: the canvas's week is its document id, not a field. */
export type StoredPlacement = Omit<TilePlacement, 'week'>;

export const roomPath = (roomId: string) => `${ROOMS}/${roomId}`;
export const playersPath = (roomId: string) => `${ROOMS}/${roomId}/players`;
export const playerPath = (roomId: string, playerId: string) => `${playersPath(roomId)}/${playerId}`;
export const habitsPath = (roomId: string, playerId: string) => `${playerPath(roomId, playerId)}/habits`;
export const daysPath = (roomId: string, playerId: string) => `${playerPath(roomId, playerId)}/days`;
/**
 * Room-readable mirror. Firestore authorises whole documents, never single
 * fields, so anything the room may see has to live in its own doc — hence
 * `public/day_{date}` and `public/week_{key}` beside the owner-only originals.
 */
export const publicPath = (roomId: string, playerId: string) => `${playerPath(roomId, playerId)}/public`;
export const publicDayId = (day: string) => `day_${day}`;
export const publicWeekId = (week: string) => `week_${week}`;
export const weeksPath = (roomId: string, playerId: string) => `${playerPath(roomId, playerId)}/weeks`;
export const messagesPath = (roomId: string) => `${ROOMS}/${roomId}/messages`;

/**
 * One document per player per day: every habit value for that date.
 *
 * Split into a private half and a public half. `values` holds the raw ticks
 * and is owner-only, because a tick keyed by habitId would otherwise leak a
 * private habit's existence and completion to anyone reading the room. The
 * room instead reads `summary`, which carries the numbers the leaderboard and
 * the puzzle need without naming anything.
 */
export interface DayDoc {
  /** habitId -> reps logged. 0 on a bad habit means "avoided". OWNER-ONLY. */
  values: Record<string, number>;
  /** Room-visible totals, recomputed on every write. */
  summary: DaySummary;
  updatedAt: string;
}

/** What the room may see about someone's day. Never names a habit. */
export interface DaySummary {
  /** Tiles earned today — public habits and private ones alike. */
  earned: number;
  /** Active habits today, so "6 of 8" reads correctly without listing them. */
  total: number;
  /** Every active habit came good — drives the room streak. */
  cleared: boolean;
}

/**
 * The stored form of a week's canvas.
 *
 * Placements omit `week` deliberately — it's the document id, so storing it on
 * every tile would be redundant and could drift. `StoredPlacement` is
 * therefore `TilePlacement` minus that field; the hook re-attaches it on read.
 */
export interface WeekDoc {
  imageUrl: string;
  cols: number;
  rows: number;
  /** The image's true width/height, so the frame never stretches the picture. */
  aspect?: number;
  placements: StoredPlacement[];
  revealed: boolean;
  sharedWith?: string;
  createdAt: string;
}

/**
 * Chat is batched: one rolling document per player per day, so ticking eight
 * habits posts one updating line rather than eight messages. Milestones
 * (day cleared, picture finished, streak hit) write their own `event` docs.
 */
export interface MessageDoc {
  playerId: string | null; // null = system
  kind: 'batch' | 'event' | 'text';
  body: string;
  /** For 'batch': the day being summarised, so the doc id can be derived. */
  day?: string;
  /** For 'batch': how many tiles placed so far today. */
  count?: number;
  at: string;
}

/** Invite codes deliberately exclude 0/O/1/I — they're read aloud and retyped. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(len = 6): string {
  let out = '';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Batched-chat doc id, so the same player-day always updates one document. */
export const batchMessageId = (playerId: string, day: string) => `batch_${playerId}_${day}`;
