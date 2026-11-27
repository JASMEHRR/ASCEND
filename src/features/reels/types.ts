/**
 * Reels live at `users/{uid}/reels/{id}`, one doc per Instagram reel JasMehr
 * sent to Muse for review.
 *
 * Muse (his separate agent) writes and updates every field through its own
 * Admin SDK credentials. The browser may only flip `archived` and delete a
 * reel (firestore.rules enforces that split); it never creates one or edits
 * Muse's fields.
 */

export const REEL_BUCKETS = [
  'Opportunities',
  'Claude & Coding',
  'Video & Animation',
  'AI Models & Agents',
  'Trading & Finance',
  'Desktop, Voice & Home',
  'Business & Creator',
  'Deals & Shopping',
  'Entertainment & Explainers',
] as const;
export type ReelBucket = (typeof REEL_BUCKETS)[number];

export const CLAIM_STATUSES = ['confirmed', 'disputed', 'unverified'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface ReelClaim {
  claim: string;
  status: ClaimStatus;
  evidence: string;
}

export interface ReelSource {
  label: string;
  url: string;
}

/** Every product, repo, tool or service a reel mentions. */
export interface ReelLink {
  label: string;
  /** Null when there is nothing to open (a subscription, an offline store). */
  url: string | null;
  paid: boolean;
  /** The catch: price, renewal, beta status, "#ad". */
  note: string;
}

export interface Reel {
  id: string;
  igUrl: string;
  title: string;
  author: string;
  /** ISO string; Muse writes a Firestore Timestamp, normalised on read. */
  sharedAt: string | null;
  /** Null when Muse wrote a bucket outside the fixed list; shows under All only. */
  bucket: ReelBucket | null;
  /** Subcategory inside the bucket, chosen by Muse; '' when missing. */
  subcat: string;
  tags: string[];
  /** 0 to 10, or null when unrated. */
  score: number | null;
  isBS: boolean;
  oneLine: string;
  whatItIs: string;
  verdict: string;
  claims: ReelClaim[];
  sources: ReelSource[];
  nextAction: string;
  status: 'ready' | 'pending';
  links: ReelLink[];
  /** Muse's verdict on whether this reel helps JasMehr; '' until backfilled. */
  forYou: string;
  /** Set from the page; archived reels leave every view except Archived. */
  archived: boolean;
  /**
   * Set from the page ("Not BS — re-evaluate") together with isBS = false.
   * Muse re-researches the reel, writes the new review and clears it; the
   * page never clears it.
   */
  reevalRequested: boolean;
  reevalRequestedAt: string | null;
}

/** Which half of life a reel belongs to; the Reels page can show one at a time. */
export const SIDES = ['work', 'personal'] as const;
export type Side = (typeof SIDES)[number];

/**
 * JasMehr's own category (Anime, Claude...), at `users/{uid}/reelCats/{id}`.
 * Written only from the app; Muse never touches it, so a reel Muse rewrites
 * keeps its categories. A reel can sit in several.
 */
export interface ReelCategory {
  id: string;
  name: string;
  side: Side;
  reelIds: string[];
}

/** Work/Personal per Muse division, at `users/{uid}/reelPrefs/sides`; unset ones use the defaults. */
export type DivisionSides = Partial<Record<ReelBucket, Side>>;
