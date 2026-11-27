/**
 * Reels Library: every Instagram reel JasMehr sent Muse for review, so he
 * never has to open Instagram to find one again.
 *
 * Three levels: a home of division tiles (one per bucket, plus All, Top rated
 * and BS) -> a division split into Muse's subcategories -> one reel, playing
 * in a side pane (stacked video-first on a phone) with its review under it.
 * Search and tags always work across every division.
 *
 * Swipe a card left to archive it (Undo bar), right to delete it (asks
 * first); the opened reel has the same two as buttons for desktop. Archived
 * reels leave every count and view and collect under Archived.
 *
 * Muse writes the reviews; this page reads them live and may only flip
 * `archived` or delete a reel. It is owner-only:
 * the module is hidden from every other account (registry `ownerOnly`) and the
 * rules only let a user read their own `reels`, which only Muse fills.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Film,
  Flag,
  Link2,
  Loader2,
  Search,
  Trash2,
  Undo2,
  VideoOff,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { deleteReel, setReelArchived, subscribeReels } from './reelsClient';
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
import type { ClaimStatus, Reel, ReelLink } from './types';

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

  const noUser = () => Promise.reject(new Error('Not signed in.'));
  return (
    <ReelsView
      items={items}
      loadError={loadError}
      setArchived={(id, archived) => (uid ? setReelArchived(uid, id, archived) : noUser())}
      remove={(id) => (uid ? deleteReel(uid, id) : noUser())}
    />
  );
}

/** How far a card has to travel before letting go archives or deletes it. */
const SWIPE_PX = 90;
const UNDO_MS = 6000;

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
export function ReelsView({
  items,
  loadError,
  setArchived,
  remove,
}: {
  items: Reel[] | null;
  loadError: string | null;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}) {
  const toast = useToast();
  const [view, setView] = useState<TabId | 'home' | 'archived'>('home');
  const [undo, setUndo] = useState<Reel | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Reel | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('score');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Archived reels drop out of every count and view except Archived.
  const all = useMemo(() => (items ?? []).filter((r) => !r.archived), [items]);
  const archivedList = useMemo(() => sortReels((items ?? []).filter((r) => r.archived), 'newest'), [items]);
  const inArchive = view === 'archived';
  // Looked up by id on every render, so a live update keeps the same reel
  // open; one archived or restored out of the current view closes.
  const selected = selectedId ? ((inArchive ? archivedList : all).find((r) => r.id === selectedId) ?? null) : null;
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
    if (view === 'archived') return [{ name: '', reels: archivedList }];
    if (view === 'all') return groupBy(all, (r) => r.bucket ?? '', sort);
    const list = all.filter((r) => inTab(r, view));
    if (view === 'top' || view === 'bs') return [{ name: '', reels: sortReels(list, sort) }];
    return groupBy(list, (r) => r.subcat, sort);
  }, [all, archivedList, querying, tag, search, view, sort]);
  const resultCount = groups.reduce((n, g) => n + g.reels.length, 0);

  // Opening a reel on a phone swaps the list for the reel; start it at the top.
  useEffect(() => {
    if (selectedId && isNarrow()) topRef.current?.scrollIntoView({ block: 'start' });
  }, [selectedId]);

  // The undo bar lives a few seconds after each archive.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [undo]);

  const fail = (what: string) => (err: unknown) =>
    toast.show({ kind: 'warning', title: `Couldn't ${what}`, message: (err as Error).message || 'Try again in a moment.' });

  const archive = (r: Reel) => {
    if (selectedId === r.id) setSelectedId(null);
    setUndo(r);
    setArchived(r.id, true).catch((err) => {
      setUndo(null);
      fail('archive')(err);
    });
  };
  const restore = (r: Reel) => {
    if (selectedId === r.id) setSelectedId(null);
    setArchived(r.id, false).catch(fail('restore'));
  };
  const undoArchive = () => {
    if (!undo) return;
    const r = undo;
    setUndo(null);
    setArchived(r.id, false).catch(fail('undo'));
  };
  const confirmRemove = () => {
    const r = confirmDelete;
    setConfirmDelete(null);
    if (!r) return;
    if (selectedId === r.id) setSelectedId(null);
    remove(r.id).then(
      () => toast.show({ kind: 'info', title: 'Deleted', message: r.title }),
      fail('delete'),
    );
  };

  const open = (next: TabId | 'home' | 'archived') => {
    setView(next);
    setTag(null);
    setSearch('');
    setSelectedId(null);
  };
  const pickTag = (t: string) => {
    setTag((cur) => (cur === t ? null : t));
    setSelectedId(null);
  };

  const heading = querying ? 'Results' : view === 'home' ? null : view === 'archived' ? 'Archived' : tabLabel(view);

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
            <button
              onClick={() => open('archived')}
              className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] font-semibold text-white/60 hover:text-white"
            >
              <Archive size={14} /> Archived <span className="font-mono text-[12px] text-white/40">{archivedList.length}</span>
            </button>
            <p className="px-1 text-[12px] text-white/35">On a phone: swipe a reel left to archive it, right to delete it.</p>
          </>
        ) : resultCount === 0 ? (
          <Message>{inArchive && !querying ? 'Nothing archived. Swipe a reel left to archive it.' : 'Nothing here matches.'}</Message>
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
                <SwipeRow
                  key={r.id}
                  leftLabel={r.archived ? 'Restore' : 'Archive'}
                  onSwipeLeft={() => (r.archived ? restore(r) : archive(r))}
                  onSwipeRight={() => setConfirmDelete(r)}
                >
                  <ReelRow reel={r} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} activeTag={tag} onTag={pickTag} />
                </SwipeRow>
              ))}
            </section>
          ))
        )}
      </div>

      {selected && (
        <aside className="w-full lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7rem)] lg:w-[400px] lg:shrink-0 lg:self-start lg:overflow-y-auto custom-scrollbar">
          <ReelDetail
            reel={selected}
            onClose={() => setSelectedId(null)}
            activeTag={tag}
            onTag={pickTag}
            onArchive={() => (selected.archived ? restore(selected) : archive(selected))}
            onDelete={() => setConfirmDelete(selected)}
          />
        </aside>
      )}

      {undo &&
        createPortal(
          <div
            role="status"
            className="fixed left-1/2 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/12 bg-app/90 px-4 py-3 shadow-lg backdrop-blur-md bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-6"
          >
            <p className="min-w-0 flex-1 truncate text-[13px] text-white/80">
              Archived <span className="font-semibold text-white">{undo.title}</span>
            </p>
            <button
              onClick={undoArchive}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-3 py-2 text-[13px] font-bold text-white hover:bg-white/15"
            >
              <Undo2 size={13} /> Undo
            </button>
          </div>,
          document.body,
        )}

      {confirmDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
            onClick={() => setConfirmDelete(null)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reel-delete-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-white/12 bg-app p-4 shadow-xl"
            >
              <p id="reel-delete-title" className="text-[15px] font-bold text-white">
                Delete this reel for good?
              </p>
              <p className="mt-1 text-[13px] leading-snug text-white/60">
                <span className="text-white/85">{confirmDelete.title}</span> and its review are removed and can't be brought back.
                Archive keeps it out of the way instead.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  autoFocus
                  onClick={() => setConfirmDelete(null)}
                  className="cursor-pointer rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-[13px] font-semibold text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemove}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/20 px-4 py-2 text-[13px] font-bold text-red-200 hover:bg-red-500/30"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Touch swipe on a card: left past SWIPE_PX archives (or restores, in
 * Archived), right asks to delete. Only touch and pen drag; a mouse clicks as
 * normal, and desktop uses the buttons in the opened reel. A mostly vertical
 * move is left to the page scroll.
 */
function SwipeRow({
  children,
  leftLabel,
  onSwipeLeft,
  onSwipeRight,
}: {
  children: ReactNode;
  leftLabel: string;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const reset = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };

  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };
  const onMove = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!dragging) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        start.current = null;
        return;
      }
      if (Math.abs(mx) < 10) return;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDx(mx);
  };
  const onUp = () => {
    if (dragging) {
      swiped.current = true;
      if (dx <= -SWIPE_PX) onSwipeLeft();
      else if (dx >= SWIPE_PX) onSwipeRight();
    }
    reset();
  };

  const past = Math.abs(dx) >= SWIPE_PX;
  return (
    <div className="relative overflow-hidden rounded-2xl">
      {dx !== 0 && (
        <div
          aria-hidden
          className={`absolute inset-0 flex items-center px-5 text-[13px] font-bold uppercase tracking-wide ${
            dx > 0
              ? `justify-start ${past ? 'bg-red-500/35 text-red-100' : 'bg-red-500/15 text-red-300'}`
              : `justify-end ${past ? 'bg-brand-500/35 text-white' : 'bg-brand-500/15 text-brand-300'}`
          }`}
        >
          {dx > 0 ? (
            <span className="flex items-center gap-1.5">
              <Trash2 size={15} /> Delete
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              {leftLabel} <Archive size={15} />
            </span>
          )}
        </div>
      )}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
        className={`relative bg-app ${dragging ? '' : 'transition-transform duration-200'}`}
      >
        {children}
      </div>
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

function PaidBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[11.5px] font-black uppercase tracking-wider text-amber-200">
      Paid
    </span>
  );
}

/** Block-letter section heading, used for the about headline and FOR YOU. */
function BlockHeading({ children, className = 'text-white' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[15px] font-black uppercase leading-tight tracking-[0.12em] ${className}`}>{children}</p>;
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
            {reel.links.length > 0 && (
              <span className="inline-flex items-center gap-1 text-white/50">
                <Link2 size={12} /> {reel.links.length} link{reel.links.length === 1 ? '' : 's'}
              </span>
            )}
            {reel.links.some((l) => l.paid) && <PaidBadge />}
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
  onArchive,
  onDelete,
}: {
  reel: Reel;
  onClose: () => void;
  activeTag: string | null;
  onTag: (tag: string) => void;
  onArchive: () => void;
  onDelete: () => void;
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
          onClick={onArchive}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] font-semibold text-white/75 hover:text-white"
        >
          {reel.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {reel.archived ? 'Restore' : 'Archive'}
        </button>
        <button
          onClick={onDelete}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-300 hover:bg-red-500/20"
        >
          <Trash2 size={14} /> Delete
        </button>
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
        {reel.whatItIs && (
          <div>
            <BlockHeading>What this reel is about</BlockHeading>
            <p className="mt-1">{reel.whatItIs}</p>
          </div>
        )}
        {reel.links.length > 0 && (
          <Detail label={`Links (${reel.links.length})`}>
            <ul className="mt-1 flex flex-col gap-1.5">
              {reel.links.map((l, i) => (
                <li key={i}>
                  <LinkRow link={l} />
                </li>
              ))}
            </ul>
          </Detail>
        )}
        {reel.forYou && (
          <div className="rounded-xl border border-brand-400/35 bg-brand-500/[0.08] p-3">
            <BlockHeading className="text-brand-300">For you</BlockHeading>
            <p className="mt-1.5 text-white/85">{reel.forYou}</p>
          </div>
        )}
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

/** One mentioned product/tool. Paid ones get an amber border and badge so they can't be missed. */
function LinkRow({ link }: { link: ReelLink }) {
  const href = link.url ? safeLink(link.url) : null;
  const body = (
    <>
      <span className="flex items-start gap-2">
        <span className={`min-w-0 flex-1 font-semibold ${href ? 'text-brand-300' : 'text-white/85'}`}>
          {link.label || href}
          {href && <ExternalLink size={12} className="ml-1 inline align-[-1px]" />}
        </span>
        {link.paid && <PaidBadge />}
      </span>
      {link.note && <span className={`mt-0.5 block text-[12.5px] leading-snug ${link.paid ? 'text-amber-100/80' : 'text-white/50'}`}>{link.note}</span>}
    </>
  );
  const cls = `block rounded-xl border p-2.5 ${link.paid ? 'border-amber-400/45 bg-amber-500/[0.08]' : 'border-white/8 bg-white/[0.02]'}`;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-white/[0.05]`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
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
