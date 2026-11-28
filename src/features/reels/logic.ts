/**
 * Pure helpers for the Reels Library: normalising Muse's docs, tabs and their
 * counts, tag/search filtering, sorting and link safety. No Firebase or React
 * here, so it runs under plain `tsx` in logic.test.ts.
 */
import {
  CLAIM_STATUSES,
  REEL_BUCKETS,
  SIDES,
  type ClaimStatus,
  type DivisionSides,
  type Reel,
  type ReelBucket,
  type ReelCategory,
  type ReelClaim,
  type ReelLink,
  type LifeSide,
  type ReelSource,
  type Side,
} from './types';

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
    reevalRequested: raw.reevalRequested === true,
    reevalRequestedAt: isoOrNull(raw.reevalRequestedAt),
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

/**
 * What the reel is about, in one line: `oneLine`, else the first sentence of
 * `whatItIs`, else the title. Never empty.
 */
export function headlineOf(r: Pick<Reel, 'oneLine' | 'whatItIs' | 'title'>): string {
  if (r.oneLine) return r.oneLine;
  const first = r.whatItIs.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0].trim() || r.whatItIs;
  return first || r.title;
}

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
  /** Set for Claude-lane sections (their reelCats id). */
  id?: string;
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

// --- Work / Personal and JasMehr's own categories -----------------------------

/** Where each Muse division sits until he moves it. */
export const DEFAULT_DIVISION_SIDE: Record<ReelBucket, LifeSide> = {
  Opportunities: 'work',
  'Claude & Coding': 'work',
  'Video & Animation': 'work',
  'AI Models & Agents': 'work',
  'Business & Creator': 'work',
  'Trading & Finance': 'personal',
  'Desktop, Voice & Home': 'personal',
  'Deals & Shopping': 'personal',
  'Entertainment & Explainers': 'personal',
};

export const CAT_NAME_MAX = 40;

/** Trimmed, single-spaced, at most CAT_NAME_MAX characters. */
export const cleanCatName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, CAT_NAME_MAX);

const asSide = (v: unknown): Side | null => (SIDES.includes(v as Side) ? (v as Side) : null);

export function normalizeCategory(id: string, raw: Record<string, unknown>): ReelCategory {
  return {
    id,
    name: cleanCatName(str(raw.name)) || 'Untitled',
    side: asSide(raw.side) ?? 'personal',
    reelIds: Array.isArray(raw.reelIds) ? [...new Set(raw.reelIds.filter((x): x is string => typeof x === 'string'))] : [],
  };
}

export function normalizeDivisionSides(raw: Record<string, unknown> | undefined): DivisionSides {
  const out: DivisionSides = {};
  for (const b of REEL_BUCKETS) {
    const s = asSide(raw?.[b]);
    if (s && s !== 'claude') out[b] = s;
  }
  return out;
}

export const divisionSide = (bucket: ReelBucket, prefs: DivisionSides): LifeSide => prefs[bucket] ?? DEFAULT_DIVISION_SIDE[bucket];

/**
 * The Claude lane's sections, in the order the lane shows them: what a Claude
 * reel is for. Fixed ids so Muse can sort reels into them (Admin SDK);
 * JasMehr can rename, delete or add more. A section is recognised by its
 * `purpose-` id, whatever its `side` says.
 */
export const CLAUDE_PURPOSES: { id: string; name: string; side: Side }[] = [
  { id: 'purpose-save-money', name: 'Save money', side: 'claude' },
  { id: 'purpose-do-more', name: 'Make Claude do more', side: 'claude' },
  { id: 'purpose-fun', name: 'Fun & personal builds', side: 'claude' },
  { id: 'purpose-earn', name: 'Earn money', side: 'claude' },
  { id: 'purpose-free-alternatives', name: 'Free alternatives to paid software', side: 'claude' },
  { id: 'purpose-learn', name: 'Learn & level up', side: 'claude' },
  { id: 'purpose-setups-hosting', name: 'Setups & self-hosting', side: 'work' },
  { id: 'purpose-news', name: 'News & updates', side: 'work' },
  { id: 'purpose-warnings', name: 'Scams & warnings', side: 'work' },
];
export const isPurposeId = (id: string): boolean => id.startsWith('purpose-');
export const UNSORTED_LANE = 'Unsorted — waiting for Muse';
const PURPOSE_ORDER = new Map(CLAUDE_PURPOSES.map((p, i) => [p.id, i]));
const SIDE_ORDER: Record<Side, number> = { work: 0, personal: 1, claude: 2 };

/** Work, then Personal, then Claude (its built-in sections in their set order), each by name. */
export const sortCategories = (cats: ReelCategory[]): ReelCategory[] =>
  [...cats].sort(
    (a, b) =>
      SIDE_ORDER[a.side] - SIDE_ORDER[b.side] ||
      (PURPOSE_ORDER.get(a.id) ?? 99) - (PURPOSE_ORDER.get(b.id) ?? 99) ||
      a.name.localeCompare(b.name),
  );

/** reel id -> the categories it is in. */
export function categoryIndex(cats: ReelCategory[]): Map<string, ReelCategory[]> {
  const map = new Map<string, ReelCategory[]>();
  for (const c of sortCategories(cats)) for (const id of c.reelIds) map.set(id, [...(map.get(id) ?? []), c]);
  return map;
}

/**
 * A reel's Work/Personal side(s): his own Work or Personal categories decide
 * when it has any (it can be both, e.g. Anime + Claude); otherwise its Muse
 * division does. A reel with neither shows on both, so nothing is ever hidden
 * by accident. Claude sections don't move a reel between Work and Personal.
 */
export function sidesOf(reel: Pick<Reel, 'bucket'>, cats: ReelCategory[], prefs: DivisionSides): LifeSide[] {
  const life = cats.filter((c): c is ReelCategory & { side: LifeSide } => c.side !== 'claude' && !isPurposeId(c.id));
  if (life.length) return [...new Set(life.map((c) => c.side))];
  return reel.bucket ? [divisionSide(reel.bucket, prefs)] : ['work', 'personal'];
}

const CLAUDE_TAG = /^(claude|claude-?code|claude-?ai|anthropic|mcp|claude-?md)$/;

/** Muse's Claude & Coding reels live only in the Claude lane. */
export const isClaudeFirst = (reel: Pick<Reel, 'bucket'>): boolean => reel.bucket === 'Claude & Coding';

/**
 * Whether a reel belongs in the Claude lane: Muse's Claude & Coding bucket, a
 * Claude tag, a Claude section, or any of his categories that is Claude-side
 * or named Claude. Tag-only Claude reels from other buckets show in both.
 */
export function isClaudeReel(reel: Pick<Reel, 'bucket' | 'tags'>, cats: ReelCategory[]): boolean {
  return (
    isClaudeFirst(reel) ||
    reel.tags.some((t) => CLAUDE_TAG.test(t)) ||
    cats.some((c) => isPurposeId(c.id) || c.side === 'claude' || /claude/i.test(c.name))
  );
}

export type SideFilter = 'all' | Side;

/** All / Work / Personal never show a Claude-first reel; the Claude lane shows every Claude reel. */
export const inSide = (reel: Pick<Reel, 'bucket' | 'tags'>, side: SideFilter, cats: ReelCategory[], prefs: DivisionSides): boolean =>
  side === 'claude'
    ? isClaudeReel(reel, cats)
    : !isClaudeFirst(reel) && (side === 'all' || sidesOf(reel, cats, prefs).includes(side));

/**
 * The Claude lane: one group per existing section in CLAUDE_PURPOSES order
 * (empty ones too, so every header shows), then every Claude reel in no
 * section under UNSORTED_LANE. A reel in two sections shows in both.
 */
export function claudeLane(reels: Reel[], cats: ReelCategory[], sort: SortMode): ReelGroup[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const inAny = new Set<string>();
  const groups: ReelGroup[] = [];
  for (const p of CLAUDE_PURPOSES) {
    const c = byId.get(p.id);
    if (!c) continue;
    const ids = new Set(c.reelIds);
    const list = reels.filter((r) => ids.has(r.id));
    list.forEach((r) => inAny.add(r.id));
    groups.push({ id: c.id, name: c.name, reels: sortReels(list, sort) });
  }
  groups.push({ id: 'unsorted', name: UNSORTED_LANE, reels: sortReels(reels.filter((r) => !inAny.has(r.id)), sort) });
  return groups;
}

/** The test doc used to prove the re-eval flow; never counted. */
const REEVAL_TEST_ID = 'zz-bs-test';

/** Reels waiting for Muse's re-check, most recently requested first. */
export const reevalQueue = (reels: Reel[]): Reel[] =>
  reels
    .filter((r) => r.reevalRequested && r.id !== REEVAL_TEST_ID)
    .sort((a, b) => (b.reevalRequestedAt ?? '').localeCompare(a.reevalRequestedAt ?? ''));

/**
 * Inside a category or Claude section: Not BS first, then reels that point at
 * something paid, then BS. Empty groups are left out.
 */
export function verdictGroups(reels: Reel[], sort: SortMode): ReelGroup[] {
  const bs = reels.filter((r) => r.isBS);
  const paid = reels.filter((r) => !r.isBS && r.links.some((l) => l.paid));
  const clean = reels.filter((r) => !r.isBS && !r.links.some((l) => l.paid));
  return [
    { id: 'not-bs', name: 'Not BS', reels: sortReels(clean, sort) },
    { id: 'paid', name: 'Paid', reels: sortReels(paid, sort) },
    { id: 'bs', name: 'BS', reels: sortReels(bs, sort) },
  ].filter((g) => g.reels.length > 0);
}

/**
 * The task "Implement" sends to Muse: do what this reel shows, adapted to
 * JasMehr's setup, safely. Plain text, no dashes, so Muse reads it as-is.
 */
export function implementTask(r: Reel): string {
  const lines = [
    `Implement this reel for JasMehr: "${r.title}"${r.author ? ` by ${r.author}` : ''}.`,
    r.igUrl ? `Reel: ${r.igUrl}` : '',
    `Ascend reel id: ${r.id}`,
    r.whatItIs ? `What it is: ${r.whatItIs}` : '',
    r.forYou || r.verdict ? `Your verdict for him: ${r.forYou || r.verdict}` : '',
    r.nextAction ? `Next action you suggested: ${r.nextAction}` : '',
    r.links.length
      ? `Tools it mentions: ${r.links.map((l) => `${l.label}${l.paid ? ' (PAID)' : ''}${l.url ? ` ${l.url}` : ''}${l.note ? `: ${l.note}` : ''}`).join('; ')}`
      : '',
    '',
    'Do what the reel shows, adapted to his real setup (his Claude subscription, his PCs, Muse plus Ascend, his projects). First check it is real, safe and worth it; if it is not, tell him why and stop.',
    'Do not pay for, subscribe to or sign up for anything, and do not share his details, without asking him first. Prefer free options.',
    'If it needs his laptop, use the laptop bridge job flow. When done, tell him what you did and what is left for him, and update the nextAction of this reel with the result.',
  ];
  return lines.filter((l, i) => l !== '' || i === 7).join('\n');
}
