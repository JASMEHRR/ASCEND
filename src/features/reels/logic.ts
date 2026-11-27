/**
 * Pure helpers for the Reels Library: normalising Muse's docs, tabs and their
 * counts, tag/search filtering, sorting and link safety. No Firebase or React
 * here, so it runs under plain `tsx` in logic.test.ts.
 */
import { CLAIM_STATUSES, REEL_BUCKETS, type ClaimStatus, type Reel, type ReelBucket, type ReelClaim, type ReelLink, type ReelSource } from './types';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** ISO string, or a Firestore Timestamp (anything with toDate()) turned into one. */
function isoOrNull(v: unknown): string | null {
  if (typeof v === 'string') {
    const d = new Date(v);
    return v.trim() && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    const d = (v as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const asObjects = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

/** Tags are compared lower-case, so `MCP` and `mcp` are one chip. */
export const normTag = (t: string): string => t.trim().replace(/^#/, '').toLowerCase();

/**
 * Turns a raw Firestore doc into a fully typed reel. Muse writes these, so any
 * field may be missing or the wrong type; a bad field falls back to an empty
 * value rather than breaking the page.
 */
export function normalizeReel(id: string, raw: Record<string, unknown>): Reel {
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.max(0, Math.min(10, raw.score)) : null;
  const bucket = REEL_BUCKETS.includes(raw.bucket as ReelBucket) ? (raw.bucket as ReelBucket) : null;
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.filter((t): t is string => typeof t === 'string').map(normTag).filter(Boolean))]
    : [];
  const claims: ReelClaim[] = asObjects(raw.claims)
    .map((c) => ({
      claim: str(c.claim),
      status: (CLAIM_STATUSES.includes(c.status as ClaimStatus) ? c.status : 'unverified') as ClaimStatus,
      evidence: str(c.evidence),
    }))
    .filter((c) => c.claim);
  const sources: ReelSource[] = asObjects(raw.sources)
    .map((s) => ({ label: str(s.label), url: str(s.url) }))
    .filter((s) => s.url || s.label);
  const links: ReelLink[] = asObjects(raw.links)
    .map((l) => ({ label: str(l.label), url: str(l.url) || null, paid: l.paid === true, note: str(l.note) }))
    .filter((l) => l.label || l.url);
  return {
    id,
    igUrl: str(raw.igUrl),
    title: str(raw.title) || '(untitled reel)',
    author: str(raw.author),
    sharedAt: isoOrNull(raw.sharedAt),
    bucket,
    subcat: str(raw.subcat),
    tags,
    score,
    isBS: raw.isBS === true,
    oneLine: str(raw.oneLine),
    whatItIs: str(raw.whatItIs),
    verdict: str(raw.verdict),
    claims,
    sources,
    nextAction: str(raw.nextAction),
    status: raw.status === 'pending' ? 'pending' : 'ready',
    links,
    forYou: str(raw.forYou),
    archived: raw.archived === true,
  };
}

// --- Tabs ----------------------------------------------------------------------

export type TabId = 'all' | 'top' | 'bs' | ReelBucket;

/** "Top rated" means a score of 8 or more. */
export const TOP_SCORE = 8;

export const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'top', label: '⭐ Top rated' },
  { id: 'bs', label: '🚩 BS / misleading' },
  ...REEL_BUCKETS.map((b) => ({ id: b as TabId, label: b })),
];

export function inTab(r: Reel, tab: TabId): boolean {
  if (tab === 'all') return true;
  if (tab === 'top') return r.score !== null && r.score >= TOP_SCORE && !r.isBS;
  if (tab === 'bs') return r.isBS;
  return r.bucket === tab;
}

export function countTabs(reels: Reel[]): Record<TabId, number> {
  const out = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<TabId, number>;
  for (const r of reels) for (const t of TABS) if (inTab(r, t.id)) out[t.id] += 1;
  return out;
}

// --- Filter and sort -----------------------------------------------------------

export interface ReelFilters {
  tab: TabId;
  /** Lower-case tag; when set it filters across every bucket and ignores the tab. */
  tag: string | null;
  search: string;
}

export const EMPTY_FILTERS: ReelFilters = { tab: 'all', tag: null, search: '' };

/** Every word must appear somewhere in title, author, tags or the review text. */
export function matchesSearch(r: Reel, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [r.title, r.author, r.tags.join(' '), r.oneLine, r.whatItIs, r.verdict].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function matchesFilters(r: Reel, f: ReelFilters): boolean {
  if (f.tag ? !r.tags.includes(f.tag) : !inTab(r, f.tab)) return false;
  return matchesSearch(r, f.search);
}

export type SortMode = 'newest' | 'score';

const time = (r: Reel) => (r.sharedAt ? Date.parse(r.sharedAt) : 0);

/** Newest first; by score puts unrated reels last, ties broken by newest. */
export function sortReels(reels: Reel[], mode: SortMode): Reel[] {
  return [...reels].sort((a, b) => {
    if (mode === 'score') {
      const d = (b.score ?? -1) - (a.score ?? -1);
      if (d !== 0) return d;
    }
    return time(b) - time(a) || a.title.localeCompare(b.title);
  });
}

// --- Display -------------------------------------------------------------------

export type ScoreTone = 'high' | 'mid' | 'low' | 'none';

export function scoreTone(score: number | null): ScoreTone {
  if (score === null) return 'none';
  if (score >= TOP_SCORE) return 'high';
  if (score >= 5) return 'mid';
  return 'low';
}

/** Only http(s) links are ever rendered, so a doc can't inject `javascript:`. */
export function safeLink(link: string): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// --- Divisions and subcategories ---------------------------------------------

export const OTHER_SUBCAT = 'Other';

export interface Division {
  bucket: ReelBucket;
  count: number;
  topScore: number | null;
  /** Distinct subcats, biggest first. */
  subcats: string[];
}

export function divisions(reels: Reel[]): Division[] {
  return REEL_BUCKETS.map((bucket) => {
    const mine = reels.filter((r) => r.bucket === bucket);
    const scores = mine.map((r) => r.score).filter((s): s is number => s !== null);
    return {
      bucket,
      count: mine.length,
      topScore: scores.length ? Math.max(...scores) : null,
      subcats: groupBy(mine, (r) => r.subcat, 'score').map((g) => g.name),
    };
  });
}

export interface ReelGroup {
  name: string;
  reels: Reel[];
}

/**
 * Groups reels into headed sections: biggest section first, ties by name,
 * an empty key always last as "Other". Nothing is hardcoded, so new subcats
 * Muse adds show up on their own.
 */
export function groupBy(reels: Reel[], key: (r: Reel) => string, sort: SortMode): ReelGroup[] {
  const map = new Map<string, Reel[]>();
  for (const r of reels) {
    const k = key(r).trim();
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .sort(([a, ra], [b, rb]) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || rb.length - ra.length || a.localeCompare(b))
    .map(([k, list]) => ({ name: k || OTHER_SUBCAT, reels: sortReels(list, sort) }));
}

/** Most used tags across the library, for the chips on the home view. */
export function topTags(reels: Reel[], limit = 16): { tag: string; count: number }[] {
  const n = new Map<string, number>();
  for (const r of reels) for (const t of r.tags) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * Instagram's embed page for a reel or post: /reel/CODE/ -> /reel/CODE/embed/,
 * /p/CODE/ -> /p/CODE/embed/. Null for anything that isn't an Instagram
 * reel/post link, so the page shows its fallback instead of a broken frame.
 */
export function embedUrl(igUrl: string): string | null {
  const safe = safeLink(igUrl);
  if (!safe) return null;
  const u = new URL(safe);
  if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(?:[\w.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const kind = m[1] === 'p' ? 'p' : m[1] === 'tv' ? 'tv' : 'reel';
  return `https://www.instagram.com/${kind}/${m[2]}/embed/`;
}
