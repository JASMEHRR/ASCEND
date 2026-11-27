/**
 * Reels Library: every Instagram reel JasMehr sent Muse for review, sorted
 * into buckets, so he never has to open Instagram to find one again.
 *
 * Muse writes the reviews; this page only reads them live. It is owner-only:
 * the module is hidden from every other account (registry `ownerOnly`) and the
 * rules only let a user read their own `reels`, which only Muse fills.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink, Film, Flag, Loader2, Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeReels } from './reelsClient';
import {
  EMPTY_FILTERS,
  TABS,
  countTabs,
  matchesFilters,
  safeLink,
  scoreTone,
  sortReels,
  type ReelFilters,
  type ScoreTone,
  type SortMode,
} from './logic';
import type { ClaimStatus, Reel } from './types';

export default function ReelsHub() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<Reel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    setLoadError(null);
    return subscribeReels(
      uid,
      (next) => {
        setItems(next);
        setLoadError(null);
      },
      setLoadError,
    );
  }, [uid]);

  return <ReelsView items={items} loadError={loadError} />;
}

const SCORE_STYLE: Record<ScoreTone, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35',
  mid: 'bg-amber-500/15 text-amber-300 border-amber-400/35',
  low: 'bg-red-500/15 text-red-300 border-red-400/35',
  none: 'bg-white/[0.06] text-white/45 border-white/12',
};

const CLAIM_STYLE: Record<ClaimStatus, string> = {
  confirmed: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300',
  disputed: 'border-red-400/40 bg-red-500/15 text-red-300',
  unverified: 'border-white/15 bg-white/[0.06] text-white/60',
};

const formatShared = (iso: string | null): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

/** Display side: tabs, search, sort, cards. Knows nothing about Firestore. */
export function ReelsView({ items, loadError }: { items: Reel[] | null; loadError: string | null }) {
  const [filters, setFilters] = useState<ReelFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortMode>('newest');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const counts = useMemo(() => countTabs(items ?? []), [items]);
  const visible = useMemo(
    () => sortReels((items ?? []).filter((r) => matchesFilters(r, filters)), sort),
    [items, filters, sort],
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickTag = (tag: string) => setFilters((f) => ({ ...f, tag: f.tag === tag ? null : tag }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <Film size={18} className="text-brand-400" /> Reels Library
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-white/50">
          Every reel you sent Muse, reviewed and sorted. Tap a card for the full verdict.
        </p>
      </div>

      {/* Tabs scroll sideways on a phone; each shows its count. */}
      <div role="tablist" aria-label="Buckets" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 custom-scrollbar">
        {TABS.map((t) => {
          const on = !filters.tag && filters.tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setFilters((f) => ({ ...f, tab: t.id, tag: null }))}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors ${
                on ? 'border-brand-400/45 bg-brand-500/20 text-brand-300' : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'
              }`}
            >
              {t.label}
              <span className={`font-mono text-[12px] ${on ? 'text-brand-300/80' : 'text-white/40'}`}>{counts[t.id]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search reels</span>
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search title, author, tags, verdict"
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-brand-400/50"
          />
        </label>
        <label className="relative shrink-0">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="cursor-pointer appearance-none rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-3 pr-7 text-[13px] font-semibold text-white/75 outline-none focus:border-brand-400/50"
          >
            <option value="newest">Newest</option>
            <option value="score">By score</option>
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40" />
        </label>
      </div>

      {filters.tag && (
        <div className="flex items-center gap-2 text-[13px] text-white/55">
          Tag across all buckets:
          <button
            onClick={() => setFilters((f) => ({ ...f, tag: null }))}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-brand-400/45 bg-brand-500/20 px-2.5 py-1 font-semibold text-brand-300"
          >
            #{filters.tag} <X size={12} />
          </button>
        </div>
      )}

      {loadError ? (
        <Message icon={<AlertTriangle size={16} className="text-amber-400" />}>Couldn't load reels: {loadError}</Message>
      ) : items === null ? (
        <Message icon={<Loader2 size={16} className="animate-spin text-white/40" />}>Loading reels…</Message>
      ) : items.length === 0 ? (
        <Message>No reels on this account yet. Muse writes them here after each review.</Message>
      ) : visible.length === 0 ? (
        <Message>Nothing here matches.</Message>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((r) => (
            <ReelCard key={r.id} reel={r} expanded={expanded.has(r.id)} onToggle={() => toggle(r.id)} activeTag={filters.tag} onTag={pickTag} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReelCard({
  reel,
  expanded,
  onToggle,
  activeTag,
  onTag,
}: {
  reel: Reel;
  expanded: boolean;
  onToggle: () => void;
  activeTag: string | null;
  onTag: (tag: string) => void;
}) {
  const ig = safeLink(reel.igUrl);
  const tone = scoreTone(reel.score);
  return (
    <article className={`rounded-2xl border bg-white/[0.03] transition-colors ${expanded ? 'border-white/20' : 'border-white/10'}`}>
      <button onClick={onToggle} aria-expanded={expanded} className="flex w-full cursor-pointer items-start gap-3 p-3 text-left">
        <span
          aria-label={reel.score === null ? 'Not rated' : `Score ${reel.score} out of 10`}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-[14px] font-bold ${SCORE_STYLE[tone]}`}
        >
          {reel.score ?? '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-white">{reel.title}</span>
            <ChevronDown size={14} className={`mt-0.5 shrink-0 text-white/35 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/45">
            {reel.author && <span>{reel.author}</span>}
            {reel.sharedAt && <span>· {formatShared(reel.sharedAt)}</span>}
            {reel.isBS && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-red-300">
                <Flag size={11} /> BS
              </span>
            )}
            {reel.status === 'pending' && (
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-white/55">
                Pending
              </span>
            )}
          </span>
          {reel.oneLine && <span className="mt-1.5 block text-[13px] leading-snug text-white/70">{reel.oneLine}</span>}
        </span>
      </button>

      {reel.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-[3.75rem]">
          {reel.tags.map((t) => (
            <button
              key={t}
              onClick={() => onTag(t)}
              aria-pressed={activeTag === t}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                activeTag === t ? 'border-brand-400/45 bg-brand-500/20 text-brand-300' : 'border-white/10 bg-white/[0.04] text-white/55 hover:text-white'
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-white/8 px-3 pb-3 pt-3 text-[13px] leading-relaxed text-white/70">
          {reel.bucket && <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-white/40">{reel.bucket}</p>}
          {reel.whatItIs && <Detail label="What it is">{reel.whatItIs}</Detail>}
          {reel.verdict && <Detail label="Verdict">{reel.verdict}</Detail>}
          {reel.claims.length > 0 && (
            <Detail label="Claims">
              <ul className="mt-1 flex flex-col gap-2">
                {reel.claims.map((c, i) => (
                  <li key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide ${CLAIM_STYLE[c.status]}`}>
                        {c.status}
                      </span>
                      <span className="text-white/85">{c.claim}</span>
                    </div>
                    {c.evidence && <p className="mt-1 text-[12.5px] text-white/50">{c.evidence}</p>}
                  </li>
                ))}
              </ul>
            </Detail>
          )}
          {reel.sources.length > 0 && (
            <Detail label="Sources">
              <ul className="mt-1 flex flex-col gap-1">
                {reel.sources.map((s, i) => {
                  const href = safeLink(s.url);
                  return (
                    <li key={i}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-300 hover:underline">
                          {s.label || href} <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span>{s.label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Detail>
          )}
          {reel.nextAction && <Detail label="Next action">{reel.nextAction}</Detail>}
          {ig && (
            <a
              href={ig}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-400/30 px-3 py-2 text-[13px] font-semibold text-brand-300 hover:bg-brand-500/15"
            >
              Open on Instagram <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-bold uppercase tracking-wide text-white/40">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Message({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] leading-snug text-white/55">
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <p>{children}</p>
    </div>
  );
}
