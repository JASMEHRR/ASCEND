/**
 * Reels live at `users/{uid}/reels/{id}`, one doc per Instagram reel JasMehr
 * sent to Muse for review.
 *
 * Muse (his separate agent) writes and updates every field through its own
 * Admin SDK credentials. The browser only reads; firestore.rules allows no
 * write of any kind from a page.
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

export interface Reel {
  id: string;
  igUrl: string;
  title: string;
  author: string;
  /** ISO string; Muse writes a Firestore Timestamp, normalised on read. */
  sharedAt: string | null;
  /** Null when Muse wrote a bucket outside the fixed list; shows under All only. */
  bucket: ReelBucket | null;
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
}
