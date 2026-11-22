/**
 * Pure helpers for the Internships page: normalising Muse's docs, deadline
 * parsing, grouping into sections, filtering and link safety. No Firebase or
 * React here, so it runs under plain `tsx` in logic.test.ts.
 */
import { EMAIL_STAGES, INTERNSHIP_STATUSES, type EmailStage, type Internship, type InternshipStatus } from './types';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** ISO string, or a Firestore Timestamp (anything with toDate()) turned into one. */
function isoOrNull(v: unknown): string | null {
  if (typeof v === 'string') return strOrNull(v);
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    const d = (v as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Turns a raw Firestore doc into a fully-typed entry. Muse writes these from
 * scraped data, so any field may be missing or the wrong type; a bad field
 * falls back to an empty value rather than crashing the whole page.
 */
export function normalizeInternship(id: string, raw: Record<string, unknown>): Internship {
  const status = INTERNSHIP_STATUSES.includes(raw.status as InternshipStatus) ? (raw.status as InternshipStatus) : 'to-review';
  const emailStage = EMAIL_STAGES.includes(raw.emailStage as EmailStage) ? (raw.emailStage as EmailStage) : null;
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : null;
  return {
    id,
    ref: str(raw.ref),
    section: str(raw.section),
    title: str(raw.title) || '(untitled)',
    org: str(raw.org),
    locationMode: str(raw.locationMode),
    stipendText: str(raw.stipendText),
    floorCheck: str(raw.floorCheck),
    fullyFunded: raw.fullyFunded === true,
    deadlineText: str(raw.deadlineText),
    autoApply: raw.autoApply === true,
    score,
    scoreReason: str(raw.scoreReason),
    link: strOrNull(raw.link),
    linkNote: str(raw.linkNote),
    flags: str(raw.flags),
    status,
    emailStage,
    lastEmailAt: isoOrNull(raw.lastEmailAt),
    lastEmailSubject: strOrNull(raw.lastEmailSubject),
    notes: str(raw.notes),
    source: str(raw.source),
    updatedAt: isoOrNull(raw.updatedAt),
  };
}

// --- Deadlines ---------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function monthIndex(word: string): number | undefined {
  const w = word.toLowerCase();
  return MONTHS[w.slice(0, 4) === 'sept' ? 'sept' : w.slice(0, 3)];
}

function validDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m, d);
  // Rejects overflow like 31 Feb, which Date silently rolls into March.
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
}

/**
 * Reads a calendar date out of free text like "27 Nov 2026", "Nov 27, 2026",
 * "2026-11-27" or "30 Nov 2026 (unverified)". Lenient about surrounding words,
 * strict about the date itself: no year, an impossible day, or "Rolling"
 * returns null rather than a guess.
 */
export function parseDeadline(text: string): Date | null {
  if (!text) return null;
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'i'));
  if (dmy) {
    const m = monthIndex(dmy[2]);
    return m === undefined ? null : validDate(Number(dmy[3]), m, Number(dmy[1]));
  }

  const mdy = text.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'));
  if (mdy) {
    const m = monthIndex(mdy[1]);
    return m === undefined ? null : validDate(Number(mdy[3]), m, Number(mdy[2]));
  }
  return null;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from `now` to the deadline: 0 = today, negative = passed. */
export function daysUntil(deadline: Date, now: Date = new Date()): number {
  return Math.round((startOfDay(deadline) - startOfDay(now)) / 86_400_000);
}

export const SOON_DAYS = 7;

/** Deadline today or within the next 7 days. Unparseable text never counts. */
export function isClosingSoon(item: Pick<Internship, 'deadlineText'>, now: Date = new Date()): boolean {
  const d = parseDeadline(item.deadlineText);
  if (!d) return false;
  const days = daysUntil(d, now);
  return days >= 0 && days <= SOON_DAYS;
}

// --- Badges ------------------------------------------------------------------

/**
 * Whether the entry is explicitly for the May to July 2027 window. Only an
 * explicit "May to Jul" range or "summer 2027" counts: a bare "may" is far
 * too often the English word ("may require a test") to trust.
 */
export function isMayJulWindow(item: Pick<Internship, 'deadlineText' | 'flags'>): boolean {
  const text = `${item.deadlineText} ${item.flags}`;
  return (
    /\bmay\s*(?:[-–—]|to)\s*(?:june?\s*(?:[-–—]|to)\s*)?july?\b/i.test(text) ||
    /\bsummer\s+(?:internship\s+)?2027\b/i.test(text)
  );
}

/** Muse marks a stipend that misses the floor with a cross or a warning sign. */
export function failsStipendFloor(item: Pick<Internship, 'floorCheck'>): boolean {
  return /[❌⚠]/.test(item.floorCheck) || /^\s*no\b/i.test(item.floorCheck);
}

/**
 * Only real web links become a button. Muse pulls links from scraped pages,
 * so anything else (javascript:, data:, a bare word) is treated as missing.
 */
export function safeLink(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// --- Sections ------------------------------------------------------------------

export type SectionId = 'queue' | 'auto' | 'funded' | 'rest' | 'applied' | 'done' | 'hidden';

export const SECTION_ORDER: { id: SectionId; label: string; hint: string }[] = [
  { id: 'queue', label: 'Apply queue', hint: 'Muse applies to these on its next run' },
  { id: 'auto', label: 'Auto-apply / one-click', hint: 'Pinned on top whatever the score' },
  { id: 'funded', label: 'Fully funded', hint: '' },
  { id: 'rest', label: 'Everything else', hint: 'Best score first' },
  { id: 'applied', label: 'Applied, waiting to hear', hint: 'Replies Muse found in Gmail show here' },
  { id: 'done', label: 'Done', hint: '' },
  { id: 'hidden', label: 'Skipped and closed', hint: '' },
];

/** Each entry lands in exactly one section: the first that matches. */
export function sectionOf(item: Pick<Internship, 'status' | 'autoApply' | 'fullyFunded'>): SectionId {
  switch (item.status) {
    case 'apply-queue':
      return 'queue';
    case 'applied':
      return 'applied';
    case 'done':
      return 'done';
    case 'skipped':
    case 'closed':
      return 'hidden';
    default:
      if (item.autoApply) return 'auto';
      if (item.fullyFunded) return 'funded';
      return 'rest';
  }
}

/** Score high to low, then nearest deadline; unscored and undated go last. */
export function compareByScoreThenDeadline(a: Internship, b: Internship): number {
  const sa = a.score ?? -1;
  const sb = b.score ?? -1;
  if (sa !== sb) return sb - sa;
  const da = parseDeadline(a.deadlineText)?.getTime() ?? Infinity;
  const db = parseDeadline(b.deadlineText)?.getTime() ?? Infinity;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title);
}

const STAGE_RANK: Record<EmailStage | 'none', number> = {
  offer: 0, interview: 1, assessment: 2, acknowledged: 3, none: 4, rejected: 5,
};

/** Applied entries: the hottest reply first (offer, interview, ...), rejected last. */
export function compareApplied(a: Internship, b: Internship): number {
  const ra = STAGE_RANK[a.emailStage ?? 'none'];
  const rb = STAGE_RANK[b.emailStage ?? 'none'];
  if (ra !== rb) return ra - rb;
  const la = a.lastEmailAt ? Date.parse(a.lastEmailAt) || 0 : 0;
  const lb = b.lastEmailAt ? Date.parse(b.lastEmailAt) || 0 : 0;
  if (la !== lb) return lb - la;
  return compareByScoreThenDeadline(a, b);
}

export function groupIntoSections(items: Internship[]): Record<SectionId, Internship[]> {
  const groups: Record<SectionId, Internship[]> = { queue: [], auto: [], funded: [], rest: [], applied: [], done: [], hidden: [] };
  for (const item of items) groups[sectionOf(item)].push(item);
  for (const id of Object.keys(groups) as SectionId[]) {
    groups[id].sort(id === 'applied' ? compareApplied : compareByScoreThenDeadline);
  }
  return groups;
}

// --- Filters & counts ----------------------------------------------------------

export interface InternshipFilters {
  search: string;
  status: InternshipStatus | 'all';
  remoteOnly: boolean;
  fundedOnly: boolean;
  autoOnly: boolean;
}

export const EMPTY_FILTERS: InternshipFilters = { search: '', status: 'all', remoteOnly: false, fundedOnly: false, autoOnly: false };

export function matchesFilters(item: Internship, f: InternshipFilters): boolean {
  if (f.status !== 'all' && item.status !== f.status) return false;
  if (f.remoteOnly && !/remote/i.test(item.locationMode)) return false;
  if (f.fundedOnly && !item.fullyFunded) return false;
  if (f.autoOnly && !item.autoApply) return false;
  const q = f.search.trim().toLowerCase();
  if (q && !`${item.title} ${item.org}`.toLowerCase().includes(q)) return false;
  return true;
}

export interface InternshipCounts {
  total: number;
  queued: number;
  applied: number;
  /** Still-open entries (to review or queued) whose deadline is within 7 days. */
  closingSoon: number;
}

export function countInternships(items: Internship[], now: Date = new Date()): InternshipCounts {
  let queued = 0;
  let applied = 0;
  let closingSoon = 0;
  for (const i of items) {
    if (i.status === 'apply-queue') queued += 1;
    if (i.status === 'applied') applied += 1;
    if ((i.status === 'to-review' || i.status === 'apply-queue') && isClosingSoon(i, now)) closingSoon += 1;
  }
  return { total: items.length, queued, applied, closingSoon };
}
