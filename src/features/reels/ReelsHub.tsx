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
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Flag,
  RotateCcw,
  Link2,
  Loader2,
  Search,
  Tag,
  Trash2,
  Undo2,
  VideoOff,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  createCategory,
  deleteCategory,
  deleteReel,
  ensurePurpose,
  renameCategory,
  requestReeval,
  setCategorySide,
  setDivisionSide,
  setReelArchived,
  setReelsInCategory,
  subscribeCategories,
  subscribeDivisionSides,
  subscribeReels,
} from './reelsClient';
import { CategorySheet, ManageCategories, SIDE_LABEL, SideBadge, SideSwitch } from './ReelCategories';
import {
  TABS,
  countTabs,
  divisions,
  embedUrl,
  CLAUDE_PURPOSES,
  categoryIndex,
  divisionSide,
  groupBy,
  headlineOf,
  inSide,
  inTab,
  sortCategories,
  type SideFilter,
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
import type { ClaimStatus, DivisionSides, LifeSide, Reel, ReelBucket, ReelCategory, ReelLink, Side } from './types';

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

  const [cats, setCats] = useState<ReelCategory[] | null>(null);
  const [sides, setSides] = useState<DivisionSides>({});
  useEffect(() => {
    if (!uid) return;
    const offCats = subscribeCategories(uid, setCats, () => undefined);
    const offSides = subscribeDivisionSides(uid, setSides);
    return () => {
      offCats();
      offSides();
    };
  }, [uid]);

  const noUser = () => Promise.reject(new Error('Not signed in.'));
  const catApi: CategoryApi = {
    create: (name, side, reelIds) => (uid ? createCategory(uid, name, side, reelIds) : noUser()),
    setSide: (id, side) => (uid ? setCategorySide(uid, id, side) : noUser()),
    rename: (id, name) => (uid ? renameCategory(uid, id, name) : noUser()),
    remove: (id) => (uid ? deleteCategory(uid, id) : noUser()),
    setReels: (id, reelIds, on) => (uid ? setReelsInCategory(uid, id, reelIds, on) : noUser()),
    setDivisionSide: (bucket, side) => (uid ? setDivisionSide(uid, bucket, side) : noUser()),
    ensurePurpose: (id, name) => (uid ? ensurePurpose(uid, id, name) : noUser()),
  };
  return (
    <ReelsView
      items={items}
      loadError={loadError}
      setArchived={(id, archived) => (uid ? setReelArchived(uid, id, archived) : noUser())}
      remove={(id) => (uid ? deleteReel(uid, id) : noUser())}
      reeval={(id) => (uid ? requestReeval(uid, id) : noUser())}
      cats={cats ?? []}
      catsReady={cats !== null}
      divisionSides={sides}
      catApi={catApi}
    />
  );
}

/** The category writes the page can make (all on JasMehr's own reelCats / reelPrefs). */
export interface CategoryApi {
  create: (name: string, side: Side, reelIds?: string[]) => Promise<string>;
  setSide: (id: string, side: Side) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setReels: (id: string, reelIds: string[], on: boolean) => Promise<void>;
  setDivisionSide: (bucket: ReelBucket, side: LifeSide) => Promise<void>;
  ensurePurpose: (id: string, name: string) => Promise<void>;
}

type ViewId = TabId | 'home' | 'archived' | 'claude-unsorted' | `cat:${string}`;

const SIDE_KEY = 'ascend_reels_side';
const readSide = (): SideFilter => {
  try {
    const v = localStorage.getItem(SIDE_KEY);
    return v === 'work' || v === 'personal' || v === 'claude' ? v : 'all';
  } catch {
    return 'all';
  }
};

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


/** Display side: home tiles, division sections, the reel pane. Knows nothing about Firestore. */
export function ReelsView({
  items,
  loadError,
  setArchived,
  remove,
  reeval,
  cats = [],
  catsReady = false,
  divisionSides = {},
  catApi,
}: {
  items: Reel[] | null;
  loadError: string | null;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** "Not BS — re-evaluate". */
  reeval?: (id: string) => Promise<void>;
  cats?: ReelCategory[];
  /** True once the categories listener has answered (so missing means missing). */
  catsReady?: boolean;
  divisionSides?: DivisionSides;
  catApi?: CategoryApi;
}) {
  const toast = useToast();
  const [view, setView] = useState<ViewId>('home');
  const [undo, setUndo] = useState<{ label: string; strong: string; revert: () => Promise<void> } | null>(null);
  const [side, setSideState] = useState<SideFilter>(readSide);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Reel | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('score');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // His categories per reel, and whether a reel is Work, Personal or both.
  const catIdx = useMemo(() => categoryIndex(cats), [cats]);
  const catsOf = (id: string) => catIdx.get(id) ?? [];
  const showsOn = (r: Reel, s: SideFilter) => inSide(r, s, catIdx.get(r.id) ?? [], divisionSides);
  // Archived reels drop out of every count and view except Archived; the
  // Work / Personal switch scopes everything, Archived included.
  const live = useMemo(() => (items ?? []).filter((r) => !r.archived), [items]);
  const sideCounts = useMemo(
    () => ({
      all: live.length,
      work: live.filter((r) => showsOn(r, 'work')).length,
      personal: live.filter((r) => showsOn(r, 'personal')).length,
      claude: live.filter((r) => showsOn(r, 'claude')).length,
    }),
    [live, catIdx, divisionSides],
  );
  const all = useMemo(() => live.filter((r) => showsOn(r, side)), [live, side, catIdx, divisionSides]);
  const archivedList = useMemo(
    () => sortReels((items ?? []).filter((r) => r.archived && showsOn(r, side)), 'newest'),
    [items, side, catIdx, divisionSides],
  );
  const inArchive = view === 'archived';
  const viewCat = view.startsWith('cat:') ? (cats.find((c) => c.id === view.slice(4)) ?? null) : null;
  const claudeCats = useMemo(() => sortCategories(cats.filter((c) => c.side === 'claude')), [cats]);
  // Claude reels not yet in any Claude section.
  const unsorted = useMemo(
    () => (side === 'claude' ? all.filter((r) => !(catIdx.get(r.id) ?? []).some((c) => c.side === 'claude')) : []),
    [side, all, catIdx],
  );

  // First visit to the Claude lane: make its built-in sections (once; a
  // section he later deletes is not brought back).
  const madePurposes = useRef(false);
  useEffect(() => {
    if (side !== 'claude' || !catsReady || !catApi || madePurposes.current) return;
    madePurposes.current = true;
    const have = new Set(cats.map((c) => c.id));
    if (CLAUDE_PURPOSES.some((p) => have.has(p.id))) return;
    Promise.all(CLAUDE_PURPOSES.map((p) => catApi.ensurePurpose(p.id, p.name))).catch(fail('set up the Claude sections'));
  });
  const countIn = (pool: Reel[]) => {
    const ids = new Set(pool.map((r) => r.id));
    return new Map(cats.map((c) => [c.id, c.reelIds.filter((id) => ids.has(id)).length]));
  };
  const catCounts = useMemo(() => countIn(all), [cats, all]);
  const liveCatCounts = useMemo(() => countIn(live), [cats, live]);
  const setSide = (v: SideFilter) => {
    setSideState(v);
    setSelectedId(null);
    try {
      localStorage.setItem(SIDE_KEY, v);
    } catch {
      /* private mode: just not remembered */
    }
  };
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
    // Grouped by Muse's subcategory, so a whole group can be filed with "Put in…".
    if (view === 'claude-unsorted') return groupBy(unsorted, (r) => r.subcat || r.bucket || '', sort);
    if (view.startsWith('cat:')) {
      if (!viewCat) return [];
      const ids = new Set(viewCat.reelIds);
      return groupBy(all.filter((r) => ids.has(r.id)), (r) => r.bucket ?? '', sort);
    }
    if (view === 'all') return groupBy(all, (r) => r.bucket ?? '', sort);
    const tab = view as TabId;
    const list = all.filter((r) => inTab(r, tab));
    if (tab === 'top' || tab === 'bs') return [{ name: '', reels: sortReels(list, sort) }];
    return groupBy(list, (r) => r.subcat, sort);
  }, [all, archivedList, unsorted, querying, tag, search, view, viewCat, sort]);
  const resultCount = groups.reduce((n, g) => n + g.reels.length, 0);
  // The list in reading order, for ← / → and for "next reel" after a removal.
  const flat = useMemo(() => groups.flatMap((g) => g.reels), [groups]);
  const index = selected ? flat.findIndex((r) => r.id === selected.id) : -1;
  const step = (by: -1 | 1) => {
    const next = index >= 0 ? flat[index + by] : undefined;
    if (next) setSelectedId(next.id);
  };
  /** Leaving a reel (archived, restored, deleted) opens the next one in the list. */
  const moveOff = (r: Reel) => {
    if (selectedId !== r.id) return;
    const i = flat.findIndex((x) => x.id === r.id);
    setSelectedId((flat[i + 1] ?? flat[i - 1])?.id ?? null);
  };

  // Each opened reel starts at the top, so the verdict pane is in view.
  useEffect(() => {
    if (selectedId) topRef.current?.scrollIntoView({ block: 'start' });
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
    moveOff(r);
    setUndo({ label: 'Archived', strong: r.title, revert: () => setArchived(r.id, false) });
    setArchived(r.id, true).catch((err) => {
      setUndo(null);
      fail('archive')(err);
    });
  };
  const restore = (r: Reel) => {
    moveOff(r);
    setArchived(r.id, false).catch(fail('restore'));
  };
  const notBS = (r: Reel) => {
    if (!reeval) return;
    reeval(r.id).then(
      () => toast.show({ kind: 'info', title: 'Sent back to Muse', message: `"${r.title}" is un-flagged and queued for a fresh review.` }),
      fail('send it for re-evaluation'),
    );
  };

  const undoLast = () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    u.revert().catch(fail('undo'));
  };

  // --- his categories ---
  const quickAdd = (name: string, s: Side) =>
    catApi
      ?.create(name, s)
      .then(() => toast.show({ kind: 'info', title: `Made "${name}"`, message: 'Open a reel and tap 🏷, or use "Put all in…" on any list.' }))
      .catch(fail('make the category'));
  /** Puts every reel in the current list into a category; Undo takes back only the ones it added. */
  const putAllIn = (catId: string, reels: Reel[] = flat) => {
    if (catId === '__new') return setShowManage(true);
    const cat = cats.find((c) => c.id === catId);
    if (!cat || !catApi) return;
    const already = new Set(cat.reelIds);
    const added = reels.map((r) => r.id).filter((id) => !already.has(id));
    if (added.length === 0) {
      toast.show({ kind: 'info', title: 'Already there', message: `All ${reels.length} are in ${cat.name}.` });
      return;
    }
    setUndo({ label: `Put ${added.length} in`, strong: cat.name, revert: () => catApi.setReels(cat.id, added, false) });
    catApi.setReels(cat.id, added, true).catch((err) => {
      setUndo(null);
      fail('add to the category')(err);
    });
  };
  const confirmRemove = () => {
    const r = confirmDelete;
    setConfirmDelete(null);
    if (!r) return;
    moveOff(r);
    remove(r.id).then(
      () => toast.show({ kind: 'info', title: 'Deleted', message: r.title }),
      fail('delete'),
    );
  };

  const open = (next: ViewId) => {
    setView(next);
    setTag(null);
    setSearch('');
    setSelectedId(null);
  };
  const pickTag = (t: string) => {
    setTag((cur) => (cur === t ? null : t));
    setSelectedId(null);
  };

  const heading = querying
    ? 'Results'
    : view === 'home'
      ? null
      : view === 'archived'
        ? 'Archived'
        : view === 'claude-unsorted'
          ? 'Claude › Not sorted yet'
          : view.startsWith('cat:')
          ? (viewCat?.name ?? 'Category')
          : tabLabel(view as TabId);

  // Desktop keys while a reel is open: ← → move, Backspace/Delete remove (asks), A archive, Esc back.
  useEffect(() => {
    if (!selected || confirmDelete || sheetFor || showManage) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Backspace' || e.key === 'Delete') setConfirmDelete(selected);
      else if (e.key === 'a' || e.key === 'A') (selected.archived ? restore : archive)(selected);
      else if (e.key === 'c' || e.key === 'C') setSheetFor(selected.id);
      else if (e.key === 'Escape') setSelectedId(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div ref={topRef} className="mx-auto flex w-full max-w-6xl scroll-mt-4 gap-5 pb-8">
      {/* The list, or (while a reel is open) the decision view in its place. */}
      <div className={`min-w-0 flex-1 flex-col gap-4 ${selected ? 'hidden' : 'flex'}`}>
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

        <SideSwitch value={side} onChange={setSide} counts={sideCounts} />

        {(view !== 'home' || querying) && !inArchive && flat.length > 0 && catApi && (
          <label className="relative w-fit">
            <span className="sr-only">Put every reel in this list into a category</span>
            <select
              value=""
              onChange={(e) => putAllIn(e.target.value, flat)}
              className="cursor-pointer appearance-none rounded-full border border-white/10 bg-white/[0.04] py-2 pl-3 pr-8 text-[13px] font-semibold text-white/75 outline-none focus:border-brand-400/50"
            >
              <option value="">🏷 Put all {flat.length} in…</option>
              {sortCategories(cats).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({SIDE_LABEL[c.side]})
                </option>
              ))}
              <option value="__new">+ New category…</option>
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40" />
          </label>
        )}

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
            {side === 'claude' && (
              <section aria-label="What it's for" className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-1">
                  <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-orange-300/80">Claude · what it's for</p>
                  <span className="flex-1" />
                  <button onClick={() => setShowManage(true)} className="cursor-pointer text-[13px] font-semibold text-brand-300 hover:underline">
                    Edit sections
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {claudeCats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => open(`cat:${c.id}`)}
                      className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-orange-400/20 bg-orange-500/[0.05] p-3 text-left transition-colors hover:border-orange-400/40 hover:bg-orange-500/[0.09]"
                    >
                      <span className="text-[14px] font-bold leading-snug text-white">{c.name}</span>
                      <span className="text-[12.5px] font-semibold text-white/45">
                        {catCounts.get(c.id) ?? 0} reel{catCounts.get(c.id) === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => open('claude-unsorted')}
                    className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-3 text-left transition-colors hover:border-white/35"
                  >
                    <span className="text-[14px] font-bold leading-snug text-white/85">Not sorted yet</span>
                    <span className="text-[12.5px] font-semibold text-white/45">
                      {unsorted.length} reel{unsorted.length === 1 ? '' : 's'} · Muse sorts these, or use "Put in…"
                    </span>
                  </button>
                </div>
              </section>
            )}
            <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 ${side === 'claude' ? 'hidden' : ''}`}>
              {divs.filter((d) => side === 'all' || d.count > 0).map((d) => (
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
                  <span className="flex items-center gap-2 text-[12.5px] font-semibold text-white/45">
                    {d.count} reel{d.count === 1 ? '' : 's'}
                    <SideBadge side={divisionSide(d.bucket, divisionSides)} />
                  </span>
                  {d.subcats.length > 0 && (
                    <span className="line-clamp-2 text-[12.5px] leading-snug text-white/55">{d.subcats.join(' · ')}</span>
                  )}
                </button>
              ))}
            </div>
            {catApi && side !== 'claude' && (
              <section aria-label="My categories">
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-white/45">My categories</p>
                  <span className="flex-1" />
                  <button onClick={() => setShowManage(true)} className="cursor-pointer text-[13px] font-semibold text-brand-300 hover:underline">
                    {cats.length ? 'Manage' : '+ New'}
                  </button>
                </div>
                {cats.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-3.5 text-[13px] leading-snug text-white/55">
                    Sort reels your own way (a reel can be in several), and mark each category Work or Personal so the switch above can split them.
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button onClick={() => quickAdd('Anime', 'personal')} className="cursor-pointer rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[13px] font-semibold text-white/80 hover:text-white">
                        + Anime · Personal
                      </button>
                      <button onClick={() => quickAdd('Claude', 'work')} className="cursor-pointer rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[13px] font-semibold text-white/80 hover:text-white">
                        + Claude · Work
                      </button>
                      <button onClick={() => setShowManage(true)} className="cursor-pointer rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[13px] font-semibold text-white/80 hover:text-white">
                        + Your own
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {sortCategories(cats)
                      .filter((c) => side === 'all' || c.side === side)
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => open(`cat:${c.id}`)}
                          className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                        >
                          <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold text-white">
                            <Tag size={13} className="shrink-0 text-white/40" />
                            <span className="truncate">{c.name}</span>
                          </span>
                          <span className="flex items-center gap-2 text-[12.5px] font-semibold text-white/45">
                            {catCounts.get(c.id) ?? 0} reel{catCounts.get(c.id) === 1 ? '' : 's'}
                            <SideBadge side={c.side} />
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </section>
            )}
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
                <h3 className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-white/60">{g.name}</span>
                  <span className="font-mono text-[12px] text-white/40">{g.reels.length}</span>
                  <span className="flex-1" />
                  {catApi && !inArchive && groups.length > 1 && (
                    <label className="relative shrink-0">
                      <span className="sr-only">Put the {g.reels.length} reels in {g.name} into a category</span>
                      <select
                        value=""
                        onChange={(e) => putAllIn(e.target.value, g.reels)}
                        className="cursor-pointer appearance-none rounded-full border border-white/8 bg-transparent py-1 pl-2.5 pr-6 text-[12px] font-semibold text-white/50 outline-none hover:text-white focus:border-brand-400/50"
                      >
                        <option value="">🏷 Put in…</option>
                        {sortCategories(cats).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({SIDE_LABEL[c.side]})
                          </option>
                        ))}
                        <option value="__new">+ New category…</option>
                      </select>
                      <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/35" />
                    </label>
                  )}
                </h3>
              )}
              {g.reels.map((r) => (
                <SwipeRow
                  key={r.id}
                  leftLabel={r.archived ? 'Restore' : 'Archive'}
                  onSwipeLeft={() => (r.archived ? restore(r) : archive(r))}
                  onSwipeRight={() => setConfirmDelete(r)}
                >
                  <ReelRow reel={r} cats={catsOf(r.id)} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} activeTag={tag} onTag={pickTag} />
                </SwipeRow>
              ))}
            </section>
          ))
        )}
      </div>

      {selected && (
        <ReelDetail
          reel={selected}
          backLabel={heading ?? 'Reels'}
          position={index >= 0 ? { at: index + 1, of: flat.length } : null}
          onPrev={index > 0 ? () => step(-1) : null}
          onNext={index >= 0 && index < flat.length - 1 ? () => step(1) : null}
          onClose={() => setSelectedId(null)}
          activeTag={tag}
          onTag={pickTag}
          onArchive={() => (selected.archived ? restore(selected) : archive(selected))}
          onDelete={() => setConfirmDelete(selected)}
          onNotBS={reeval ? () => notBS(selected) : null}
          catNames={catsOf(selected.id).map((c) => c.name)}
          onCategorize={catApi ? () => setSheetFor(selected.id) : null}
        />
      )}

      {sheetFor && catApi && (items ?? []).some((r) => r.id === sheetFor) && (
        <CategorySheet
          reelTitle={(items ?? []).find((r) => r.id === sheetFor)?.title ?? ''}
          cats={cats}
          inCats={new Set(catsOf(sheetFor).map((c) => c.id))}
          onToggle={(c, on) => void catApi.setReels(c.id, [sheetFor], on).catch(fail('update the category'))}
          onCreate={(name, s) => catApi.create(name, s, [sheetFor]).catch(fail('make the category'))}
          onClose={() => setSheetFor(null)}
        />
      )}
      {showManage && catApi && (
        <ManageCategories
          cats={cats}
          counts={liveCatCounts}
          divisionSides={divisionSides}
          onCreate={(name, s) => catApi.create(name, s).catch(fail('make the category'))}
          onSide={(c, s) => void catApi.setSide(c.id, s).catch(fail('change the category'))}
          onRename={(c, name) => void catApi.rename(c.id, name).catch(fail('rename the category'))}
          onDelete={(c) => {
            if (view === `cat:${c.id}`) open('home');
            void catApi.remove(c.id).catch(fail('delete the category'));
          }}
          onDivisionSide={(b, s) => void catApi.setDivisionSide(b, s).catch(fail('move the division'))}
          onClose={() => setShowManage(false)}
        />
      )}

      {undo &&
        createPortal(
          <div
            role="status"
            className="fixed left-1/2 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/12 bg-app/90 px-4 py-3 shadow-lg backdrop-blur-md bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-6"
          >
            <p className="min-w-0 flex-1 truncate text-[13px] text-white/80">
              {undo.label} <span className="font-semibold text-white">{undo.strong}</span>
            </p>
            <button
              onClick={undoLast}
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

/** Block-letter section heading (FOR YOU). */
function BlockHeading({ children, className = 'text-white' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[15px] font-black uppercase leading-tight tracking-[0.12em] ${className}`}>{children}</p>;
}

/** The reel is in Muse's re-check queue (set by "Not BS — re-evaluate", cleared by Muse). */
function ReevalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      title="Re-evaluation requested: Muse will re-check this reel"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/45 bg-amber-500/15 font-bold uppercase tracking-wide text-amber-200 ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[11.5px]'
      }`}
    >
      <RotateCcw size={compact ? 10 : 12} /> {compact ? 'Re-eval requested' : 'Re-evaluation requested'}
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
  cats,
  selected,
  onSelect,
  activeTag,
  onTag,
}: {
  reel: Reel;
  cats: ReelCategory[];
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
          {headlineOf(reel) !== reel.title && (
            <span className="mt-0.5 line-clamp-2 block text-[13px] font-bold leading-snug text-white/85">{headlineOf(reel)}</span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/45">
            {reel.author && <span>{reel.author}</span>}
            {reel.sharedAt && <span>· {formatShared(reel.sharedAt)}</span>}
            {reel.isBS && <BsBadge />}
            {reel.reevalRequested && <ReevalBadge compact />}
            {reel.links.length > 0 && (
              <span className="inline-flex items-center gap-1 text-white/50">
                <Link2 size={12} /> {reel.links.length} link{reel.links.length === 1 ? '' : 's'}
              </span>
            )}
            {reel.links.some((l) => l.paid) && <PaidBadge />}
            {cats.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11.5px] font-semibold text-white/75">
                <Tag size={10} /> {c.name}
              </span>
            ))}
          </span>
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

/**
 * The opened reel as a decision screen: video on the left, the verdict pane
 * on the right (stacked on a phone). Headline, verdict, score and Remove all
 * fit without scrolling; everything else sits below the fold.
 */
function ReelDetail({
  reel,
  backLabel,
  position,
  onPrev,
  onNext,
  onClose,
  activeTag,
  onTag,
  onArchive,
  onDelete,
  catNames,
  onCategorize,
  onNotBS,
}: {
  reel: Reel;
  backLabel: string;
  position: { at: number; of: number } | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  activeTag: string | null;
  onTag: (tag: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  catNames: string[];
  onCategorize: (() => void) | null;
  onNotBS: (() => void) | null;
}) {
  const ig = safeLink(reel.igUrl);
  const headline = headlineOf(reel);
  // The yes/no text: Muse's personal verdict when it has one, else the review.
  const verdictText = reel.forYou || reel.verdict;
  // BS reels get "Not BS — re-evaluate"; once sent, a badge takes its place.
  const notBsButton = (size: 'sm' | 'lg') =>
    onNotBS && (
      <button
        onClick={onNotBS}
        title="Un-flag and ask Muse for a fresh review"
        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/15 font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/30 ${
          size === 'lg' ? 'px-4 py-2.5 text-[13px]' : 'px-2.5 py-1.5 text-[11.5px]'
        }`}
      >
        <RotateCcw size={size === 'lg' ? 15 : 12} strokeWidth={2.5} /> Not BS — re-evaluate
      </button>
    );
  const phoneAction = reel.isBS ? notBsButton('sm') : reel.reevalRequested ? <ReevalBadge /> : null;
  const deskAction = reel.isBS ? notBsButton('lg') : reel.reevalRequested ? <ReevalBadge /> : null;
  const navBtn =
    'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:text-white disabled:cursor-default disabled:opacity-30';
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] font-semibold text-white/75 hover:text-white"
        >
          <ArrowLeft size={14} className="shrink-0" /> <span className="truncate">{backLabel}</span>
        </button>
        <span className="flex-1" />
        <span className="hidden text-[12px] text-white/35 xl:inline">← → move · Del remove · A archive · C category</span>
        {onCategorize && (
          <button
            onClick={onCategorize}
            title="Put in a category (C)"
            aria-label={catNames.length ? `Categories: ${catNames.join(', ')}` : 'Put in a category'}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[13px] font-semibold text-white/75 hover:text-white"
          >
            <Tag size={14} />
            <span className="hidden max-w-[14rem] truncate sm:inline">{catNames.length ? catNames.join(', ') : 'Category'}</span>
            {catNames.length > 0 && <span className="font-mono text-[12px] sm:hidden">{catNames.length}</span>}
          </button>
        )}
        {position && (
          <span className="font-mono text-[12px] text-white/45">
            {position.at} / {position.of}
          </span>
        )}
        <button onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous reel" className={navBtn}>
          <ChevronLeft size={16} />
        </button>
        <button onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next reel" className={navBtn}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:h-[calc(100dvh-11.5rem)] lg:min-h-[460px] lg:flex-row">
        {/* Keyed by reel, so moving between reels swaps the one frame rather than stacking them. */}
        <VideoBox key={reel.id} igUrl={reel.igUrl} className="h-[30dvh] lg:h-full lg:w-[340px] lg:shrink-0" />

        <section aria-label="Verdict" className="flex min-h-0 flex-col gap-2.5 rounded-2xl border border-white/12 bg-white/[0.04] p-3.5 lg:flex-1 lg:p-5">
          <p className="line-clamp-3 text-[17px] font-black uppercase leading-[1.18] tracking-[0.03em] text-white lg:line-clamp-4 lg:text-[23px]">
            {headline}
          </p>
          {/* Phone: score and BS ride on the verdict's label line, so the button row
              below stays one line and clear of the floating Jarvis orb in the corner. */}
          <div className="flex items-center gap-2 lg:hidden">
            <ScoreBadge score={reel.score} />
            {reel.isBS && <BsBadge />}
            {phoneAction ?? (
              <p className={`text-[11.5px] font-black uppercase tracking-[0.14em] ${reel.forYou ? 'text-brand-300' : 'text-white/45'}`}>
                {reel.forYou ? 'For you' : 'Verdict'}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar max-lg:max-h-[13dvh]">
            <p
              className={`text-[11.5px] font-black uppercase tracking-[0.14em] ${phoneAction ? '' : 'hidden'} lg:block ${reel.forYou ? 'text-brand-300' : 'text-white/45'}`}
            >
              {reel.forYou ? 'For you' : 'Verdict'}
            </p>
            <p className="text-[14.5px] leading-relaxed text-white/90 lg:mt-1 lg:text-[16px]">{verdictText || 'No verdict yet.'}</p>
          </div>
          <div className="flex items-center gap-2 border-t border-white/8 pt-2.5">
            <span className="hidden items-center gap-2 lg:flex">
              <ScoreBadge score={reel.score} size="lg" />
              {reel.isBS && <BsBadge />}
            </span>
            <span className="hidden flex-1 lg:block" />
            {deskAction && <span className="hidden lg:contents">{deskAction}</span>}
            <button
              onClick={onDelete}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-red-400/50 bg-red-500/25 px-5 py-2.5 text-[14px] font-black uppercase tracking-wide text-red-100 hover:bg-red-500/40 lg:order-last"
            >
              <X size={16} strokeWidth={3} /> Remove
            </button>
            <button
              onClick={onArchive}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3.5 py-2.5 text-[13px] font-semibold text-white/80 hover:text-white"
            >
              {reel.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} {reel.archived ? 'Restore' : 'Archive'}
            </button>
          </div>
        </section>
      </div>

      {/* Below the fold: only when more is wanted before deciding. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] leading-relaxed text-white/70">
        <div>
          <p className="text-[15px] font-bold leading-snug text-white">{reel.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/45">
            {reel.author && <span>{reel.author}</span>}
            {reel.sharedAt && <span>· {formatShared(reel.sharedAt)}</span>}
            {reel.bucket && <span>· {reel.bucket}{reel.subcat ? ` › ${reel.subcat}` : ''}</span>}
            {catNames.length > 0 && <span>· 🏷 {catNames.join(', ')}</span>}
          </p>
        </div>
        {reel.whatItIs && reel.whatItIs !== headline && <Detail label="What this reel is about">{reel.whatItIs}</Detail>}
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
        {reel.forYou && reel.verdict && <Detail label="Muse's review">{reel.verdict}</Detail>}
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
        {reel.nextAction && <Detail label="Next action">{reel.nextAction}</Detail>}
        {reel.sources.length > 0 && (
          <Detail label="Sources">
            <ul className="mt-1 flex flex-col gap-1">
              {reel.sources.map((src, i) => {
                const href = safeLink(src.url);
                return (
                  <li key={i}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-300 hover:underline">
                        {src.label || href} <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span>{src.label}</span>
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
function VideoBox({ igUrl, className }: { igUrl: string; className: string }) {
  const src = embedUrl(igUrl);
  const ig = safeLink(igUrl);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    if (!src) return;
    const t = window.setTimeout(() => setState((s) => (s === 'loading' ? 'failed' : s)), EMBED_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [src]);

  const frame = `relative mx-auto w-full max-w-[360px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/40 ${className}`;

  if (!src || state === 'failed') {
    return (
      <div className={`${frame} flex flex-col items-center justify-center gap-3 p-6 text-center`}>
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
        // On a phone the frame is short, so Instagram's profile strip is pushed up out of view to leave room for the video.
        className={`absolute inset-x-0 -top-[54px] h-[calc(100%+54px)] w-full border-0 transition-opacity lg:top-0 lg:h-full ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}
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
