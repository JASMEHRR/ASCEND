/**
 * Reels Library: every Instagram reel JasMehr sent Muse for review, so he
 * never has to open Instagram to find one again.
 *
 * Three levels: a home of division tiles (one per bucket, plus All, Top rated
 * and BS) -> a division split into Muse's subcategories -> one reel, playing
 * in a side pane (stacked video-first on a phone) with its review under it.
 * Search and tags always work across every division.
 *
 * Muse writes the reviews; this page only reads them live. It is owner-only:
 * the module is hidden from every other account (registry `ownerOnly`) and the
 * rules only let a user read their own `reels`, which only Muse fills.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Film, Flag, Loader2, Search, VideoOff, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeReels } from './reelsClient';
import {
  TABS,
  countTabs,
  divisions,
  embedUrl,
  groupBy,
  inTab,
  matchesSearch,
  safeLink,
  scoreTone,
  sortReels,
  topTags,
  type ReelGroup,
  type ScoreTone,
  type SortMode,
  type TabId,
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

const formatShared = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';

const tabLabel = (id: TabId) => TABS.find((t) => t.id === id)?.label ?? id;

/** Phones and small tablets show the list or the reel, never both. */
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

/** Display side: home tiles, division sections, the reel pane. Knows nothing about Firestore. */
export function ReelsView({ items, loadError }: { items: Reel[] | null; loadError: string | null }) {
  const [view, setView] = useState<TabId | 'home'>('home');
  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('score');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => items ?? [], [items]);
  // Looked up by id on every render, so a live update keeps the same reel open.
  const selected = selectedId ? (all.find((r) => r.id === selectedId) ?? null) : null;
  const counts = useMemo(() => countTabs(all), [all]);
  const divs = useMemo(() => divisions(all), [all]);
  const tags = useMemo(() => topTags(all), [all]);
  const querying = tag !== null || search.trim() !== '';

  // What the list column shows, as headed groups (a single unnamed group for flat lists).
  const groups: ReelGroup[] = useMemo(() => {
    if (querying) {
      const hits = all.filter((r) => (!tag || r.tags.includes(tag)) && matchesSearch(r, search));
      return groupBy(hits, (r) => r.bucket ?? '', sort);
    }
    if (view === 'home') return [];
    if (view === 'all') return groupBy(all, (r) => r.bucket ?? '', sort);
    const list = all.filter((r) => inTab(r, view));
    if (view === 'top' || view === 'bs') return [{ name: '', reels: sortReels(list, sort) }];
    return groupBy(list, (r) => r.subcat, sort);
  }, [all, querying, tag, search, view, sort]);
  const resultCount = groups.reduce((n, g) => n + g.reels.length, 0);

  // Opening a reel on a phone swaps the list for the reel; start it at the top.
  useEffect(() => {
    if (selectedId && isNarrow()) topRef.current?.scrollIntoView({ block: 'start' });
  }, [selectedId]);

  const open = (next: TabId | 'home') => {
    setView(next);
    setTag(null);
    setSearch('');
    setSelectedId(null);
  };
  const pickTag = (t: string) => {
    setTag((cur) => (cur === t ? null : t));
    setSelectedId(null);
  };

  const heading = querying ? 'Results' : view === 'home' ? null : tabLabel(view);

  return (
    <div ref={topRef} className="mx-auto flex w-full max-w-6xl scroll-mt-4 gap-5 pb-8">
      {/* List column: hidden on a phone while a reel is open. */}
      <div className={`min-w-0 flex-1 flex-col gap-4 ${selected ? 'hidden lg:flex' : 'flex'}`}>
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
            {heading ? (
              <button
                onClick={() => open('home')}
                className="flex cursor-pointer items-center gap-2 text-white/50 hover:text-white"
                aria-label="Back to all divisions"
              >
                <ArrowLeft size={16} /> Reels
              </button>
            ) : (
              <>
                <Film size={18} className="text-brand-400" /> Reels Library
              </>
            )}
            {heading && (
              <>
                <ChevronRight size={14} className="text-white/30" />
                <span className="min-w-0 truncate">{heading}</span>
              </>
            )}
          </h2>
          {!heading && (
            <p className="mt-1 text-[13px] leading-snug text-white/50">
              {counts.all} reels you sent Muse, reviewed and sorted. Pick a division, or search across all of them.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search reels</span>
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedId(null);
              }}
              placeholder="Search all reels: title, author, tags, verdict"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-brand-400/50"
            />
          </label>
          {(view !== 'home' || querying) && (
            <label className="relative shrink-0">
              <span className="sr-only">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="cursor-pointer appearance-none rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-3 pr-7 text-[13px] font-semibold text-white/75 outline-none focus:border-brand-400/50"
              >
                <option value="score">By score</option>
                <option value="newest">Newest</option>
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            </label>
          )}
        </div>

        {tag && (
          <div className="flex items-center gap-2 text-[13px] text-white/55">
            Tag across all divisions:
            <button
              onClick={() => setTag(null)}
              className="flex cursor-pointer items-center gap-1 rounded-full border border-brand-400/45 bg-brand-500/20 px-2.5 py-1 font-semibold text-brand-300"
            >
              #{tag} <X size={12} />
            </button>
          </div>
        )}

        {loadError ? (
          <Message icon={<AlertTriangle size={16} className="text-amber-400" />}>Couldn't load reels: {loadError}</Message>
        ) : items === null ? (
          <Message icon={<Loader2 size={16} className="animate-spin text-white/40" />}>Loading reels…</Message>
        ) : items.length === 0 ? (
          <Message>No reels on this account yet. Muse writes them here after each review.</Message>
        ) : !querying && view === 'home' ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <SpecialTile label="All" count={counts.all} onClick={() => open('all')} />
              <SpecialTile label="⭐ Top rated" count={counts.top} onClick={() => open('top')} />
              <SpecialTile label="🚩 BS" count={counts.bs} danger onClick={() => open('bs')} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {divs.map((d) => (
                <button
                  key={d.bucket}
                  onClick={() => open(d.bucket)}
                  className="flex cursor-pointer flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[14px] font-bold leading-snug text-white">{d.bucket}</span>
                    {d.topScore !== null && (
                      <span
                        title="Top score in this division"
                        className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[12px] font-bold ${SCORE_STYLE[scoreTone(d.topScore)]}`}
                      >
                        ★ {d.topScore}
                      </span>
                    )}
                  </span>
                  <span className="text-[12.5px] font-semibold text-white/45">
                    {d.count} reel{d.count === 1 ? '' : 's'}
                  </span>
                  {d.subcats.length > 0 && (
                    <span className="line-clamp-2 text-[12.5px] leading-snug text-white/55">{d.subcats.join(' · ')}</span>
                  )}
                </button>
              ))}
            </div>
            {tags.length > 0 && (
              <div>
                <p className="mb-1.5 px-1 font-mono text-[12px] font-bold uppercase tracking-widest text-white/45">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <TagChip key={t.tag} tag={t.tag} on={false} onClick={() => pickTag(t.tag)} count={t.count} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : resultCount === 0 ? (
          <Message>Nothing here matches.</Message>
        ) : (
          groups.map((g) => (
            <section key={g.name || 'flat'} className="flex flex-col gap-1.5">
              {g.name && (
                <h3 className="flex items-baseline gap-2 px-1">
                  <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-white/60">{g.name}</span>
                  <span className="font-mono text-[12px] text-white/40">{g.reels.length}</span>
                </h3>
              )}
              {g.reels.map((r) => (
                <ReelRow key={r.id} reel={r} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} activeTag={tag} onTag={pickTag} />
              ))}
            </section>
          ))
        )}
      </div>

      {selected && (
        <aside className="w-full lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7rem)] lg:w-[400px] lg:shrink-0 lg:self-start lg:overflow-y-auto custom-scrollbar">
          <ReelDetail reel={selected} onClose={() => setSelectedId(null)} activeTag={tag} onTag={pickTag} />
        </aside>
      )}
    </div>
  );
}

function SpecialTile({ label, count, onClick, danger = false }: { label: string; count: number; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-1 py-2.5 transition-colors hover:bg-white/[0.06]"
    >
      <span className={`text-xl font-extrabold leading-none ${danger && count > 0 ? 'text-red-300' : 'text-white'}`}>{count}</span>
      <span className="mt-1 truncate text-[12px] font-semibold text-white/50">{label}</span>
    </button>
  );
}

function TagChip({ tag, on, onClick, count }: { tag: string; on: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        on ? 'border-brand-400/45 bg-brand-500/20 text-brand-300' : 'border-white/10 bg-white/[0.04] text-white/55 hover:text-white'
      }`}
    >
      #{tag}
      {count !== undefined && <span className="ml-1 text-white/35">{count}</span>}
    </button>
  );
}

function ScoreBadge({ score, size = 'sm' }: { score: number | null; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-label={score === null ? 'Not rated' : `Score ${score} out of 10`}
      className={`flex shrink-0 items-center justify-center rounded-xl border font-mono font-bold ${SCORE_STYLE[scoreTone(score)]} ${
        size === 'lg' ? 'h-10 w-10 text-[15px]' : 'h-8 w-8 text-[13px]'
      }`}
    >
      {score ?? '–'}
    </span>
  );
}

function BsBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-red-300">
      <Flag size={11} /> BS
    </span>
  );
}

function ReelRow({
  reel,
  selected,
  onSelect,
  activeTag,
  onTag,
}: {
  reel: Reel;
  selected: boolean;
  onSelect: () => void;
  activeTag: string | null;
  onTag: (tag: string) => void;
}) {
  return (
    <article
      className={`rounded-2xl border transition-colors ${
        selected ? 'border-brand-400/50 bg-brand-500/[0.07]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
      }`}
    >
      <button onClick={onSelect} aria-current={selected || undefined} className="flex w-full cursor-pointer items-start gap-3 p-3 pb-2 text-left">
        <ScoreBadge score={reel.score} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug text-white">{reel.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/45">
            {reel.author && <span>{reel.author}</span>}
            {reel.sharedAt && <span>· {formatShared(reel.sharedAt)}</span>}
            {reel.isBS && <BsBadge />}
          </span>
          {reel.oneLine && <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-white/65">{reel.oneLine}</span>}
        </span>
      </button>
      {reel.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-14">
          {reel.tags.map((t) => (
            <TagChip key={t} tag={t} on={activeTag === t} onClick={() => onTag(t)} />
          ))}
        </div>
      )}
    </article>
  );
}

/** The selected reel: video first, then what it is, its claims and the verdict. */
function ReelDetail({
  reel,
  onClose,
  activeTag,
  onTag,
}: {
  reel: Reel;
  onClose: () => void;
  activeTag: string | null;
  onTag: (tag: string) => void;
}) {
  const ig = safeLink(reel.igUrl);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/12 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] font-semibold text-white/75 hover:text-white lg:hidden"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="flex-1" />
        <button
          onClick={onClose}
          aria-label="Close reel"
          className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white lg:flex"
        >
          <X size={16} />
        </button>
      </div>

      {/* Keyed by reel, so switching reels swaps the one frame rather than stacking them. */}
      <VideoBox key={reel.id} igUrl={reel.igUrl} />

      <div className="flex items-start gap-3">
        <ScoreBadge score={reel.score} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-white">{reel.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/45">
            {reel.author && <span>{reel.author}</span>}
            {reel.bucket && <span>· {reel.bucket}{reel.subcat ? ` › ${reel.subcat}` : ''}</span>}
            {reel.isBS && <BsBadge />}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-white/70">
        {reel.whatItIs && <Detail label="What this video is for">{reel.whatItIs}</Detail>}
        {reel.claims.length > 0 && (
          <Detail label="What it claims vs what's true">
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
        {reel.oneLine && <Detail label="In one line">{reel.oneLine}</Detail>}
        {reel.verdict && <Detail label="Verdict">{reel.verdict}</Detail>}
        {reel.nextAction && <Detail label="Next action">{reel.nextAction}</Detail>}
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
        {reel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {reel.tags.map((t) => (
              <TagChip key={t} tag={t} on={activeTag === t} onClick={() => onTag(t)} />
            ))}
          </div>
        )}
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
    </div>
  );
}

/** How long the embed gets to load before the page gives up and shows the fallback. */
const EMBED_TIMEOUT_MS = 12000;

/**
 * One Instagram embed, only ever for the selected reel. A link that isn't an
 * Instagram reel/post, or a frame that never loads, shows a clean
 * "can't play here" box instead of a grey iframe.
 */
function VideoBox({ igUrl }: { igUrl: string }) {
  const src = embedUrl(igUrl);
  const ig = safeLink(igUrl);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    if (!src) return;
    const t = window.setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), EMBED_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [src]);

  const frame = 'relative mx-auto h-[min(620px,72dvh)] w-full max-w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-black/40';

  if (!src || state === 'failed') {
    return (
      <div className={`${frame} flex flex-col items-center justify-center gap-3 p-6 text-center`} style={{ height: 'auto', minHeight: 200 }}>
        <VideoOff size={26} className="text-white/35" />
        <p className="text-[13px] leading-snug text-white/55">
          {ig ? "This reel can't play here." : 'No Instagram link saved for this reel.'}
        </p>
        {ig && (
          <a
            href={ig}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 px-3 py-2 text-[13px] font-semibold text-brand-300 hover:bg-brand-500/15"
          >
            Open on Instagram <ExternalLink size={13} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={frame}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      )}
      <iframe
        src={src}
        title="Instagram reel"
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setState('ready')}
        onError={() => setState('failed')}
        className={`h-full w-full border-0 transition-opacity ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
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
