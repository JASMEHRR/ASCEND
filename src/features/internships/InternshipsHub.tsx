/**
 * Internships: JasMehr's control panel for the internship hunt Muse runs.
 *
 * Muse (a separate agent) writes and scores the entries; this page only reads
 * them live and lets him move each one along (queue it for Muse to apply,
 * mark applied, done, skip) and keep notes. Nothing is ever deleted here:
 * there is no delete control, and the rules forbid it anyway.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase,
  Search,
  ExternalLink,
  Link2Off,
  Send,
  CheckCheck,
  Check,
  SkipForward,
  ChevronDown,
  Mail,
  Undo2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { NOTES_MAX, subscribeInternships, updateInternship } from './internshipsClient';
import {
  EMPTY_FILTERS,
  SECTION_ORDER,
  countInternships,
  daysUntil,
  failsStipendFloor,
  groupIntoSections,
  isMayJulWindow,
  matchesFilters,
  parseDeadline,
  safeLink,
  shortPlace,
  shortStipend,
  SOON_DAYS,
  type InternshipFilters,
  type SectionId,
} from './logic';
import {
  INTERNSHIP_STATUSES,
  type EmailStage,
  type Internship,
  type InternshipPatch,
  type InternshipStatus,
} from './types';

type SaveState = 'saving' | 'saved' | 'error';

interface StatusChange {
  id: string;
  title: string;
  from: InternshipStatus;
  to: InternshipStatus;
}

const UNDO_MS = 6000;

const STATUS_LABEL: Record<InternshipStatus, string> = {
  'to-review': 'To review',
  'apply-queue': 'In apply queue',
  applied: 'Applied',
  done: 'Done',
  skipped: 'Skipped',
  closed: 'Closed',
};

const ACTIONS: { status: InternshipStatus; full: string; icon: typeof Send }[] = [
  { status: 'apply-queue', full: 'Apply to this', icon: Send },
  { status: 'applied', full: 'Mark applied', icon: CheckCheck },
  { status: 'done', full: 'Done', icon: Check },
  { status: 'skipped', full: 'Skip', icon: SkipForward },
];

const STAGE_STYLE: Record<EmailStage, string> = {
  offer: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300',
  interview: 'border-brand-400/40 bg-brand-500/15 text-brand-300',
  assessment: 'border-amber-400/40 bg-amber-500/15 text-amber-300',
  acknowledged: 'border-white/15 bg-white/[0.06] text-white/65',
  rejected: 'border-red-400/40 bg-red-500/15 text-red-300',
};

const formatWhen = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
};

/** Data side: the live listener and the narrow writes, scoped to the signed-in user. */
export default function InternshipsHub() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<Internship[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    setLoadError(null);
    return subscribeInternships(
      uid,
      (next) => {
        setItems(next);
        setLoadError(null);
      },
      setLoadError,
    );
  }, [uid]);

  return (
    <InternshipsView
      items={items}
      loadError={loadError}
      save={(id, patch) => (uid ? updateInternship(uid, id, patch) : Promise.reject(new Error('Not signed in.')))}
    />
  );
}

/** Display side: sections, filters, cards and actions. Knows nothing about Firestore. */
export function InternshipsView({
  items,
  loadError,
  save,
}: {
  items: Internship[] | null;
  loadError: string | null;
  save: (id: string, patch: InternshipPatch) => Promise<void>;
}) {
  const toast = useToast();
  const [filters, setFilters] = useState<InternshipFilters>(EMPTY_FILTERS);
  const [showHidden, setShowHidden] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => new Set(['done']));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [undo, setUndo] = useState<StatusChange | null>(null);
  const saveTimers = useRef(new Map<string, number>());

  // The undo bar lives for a few seconds after each status change.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [undo]);

  const markSave = (id: string, state: SaveState) => {
    setSaves((s) => ({ ...s, [id]: state }));
    // One pending clear per card, so an older save's timer can't wipe a newer tick.
    window.clearTimeout(saveTimers.current.get(id));
    saveTimers.current.delete(id);
    if (state === 'saved') {
      saveTimers.current.set(
        id,
        window.setTimeout(() => {
          saveTimers.current.delete(id);
          setSaves((s) => {
            const { [id]: _cleared, ...rest } = s;
            return rest;
          });
        }, 1800),
      );
    }
  };

  const write = async (id: string, patch: InternshipPatch): Promise<boolean> => {
    markSave(id, 'saving');
    try {
      await save(id, patch);
      markSave(id, 'saved');
      return true;
    } catch (err) {
      markSave(id, 'error');
      toast.show({ kind: 'warning', title: "Couldn't save", message: (err as Error).message || 'Try again in a moment.' });
      return false;
    }
  };

  const setStatus = (item: Internship, to: InternshipStatus) => {
    if (item.status === to) return;
    setUndo({ id: item.id, title: item.org || item.title, from: item.status, to });
    void write(item.id, { status: to });
  };

  const undoLast = () => {
    if (!undo) return;
    const change = undo;
    setUndo(null);
    void write(change.id, { status: change.from });
  };

  const counts = useMemo(() => countInternships(items ?? []), [items]);
  const sections = useMemo(
    () => groupIntoSections((items ?? []).filter((i) => matchesFilters(i, filters))),
    [items, filters],
  );
  const hiddenCount = useMemo(() => (items ?? []).filter((i) => i.status === 'skipped' || i.status === 'closed').length, [items]);
  const revealHidden = showHidden || filters.status === 'skipped' || filters.status === 'closed';
  const visibleSections = SECTION_ORDER.filter((s) => sections[s.id].length > 0 && (s.id !== 'hidden' || revealHidden));
  const filtersActive =
    filters.search.trim() !== '' || filters.status !== 'all' || filters.remoteOnly || filters.fundedOnly || filters.autoOnly;

  const toggleSet = <T,>(setter: (fn: (prev: Set<T>) => Set<T>) => void, key: T) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <Briefcase size={18} className="text-brand-400" /> Internships
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-white/50">
          Priority: the May to July 2027 summer internship (SIP). Muse finds, scores and applies; you decide.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Total" value={counts.total} />
        <StatTile label="Queued" value={counts.queued} accent={counts.queued > 0} />
        <StatTile label="Applied" value={counts.applied} />
        <StatTile label={`Due in ${SOON_DAYS}d`} value={counts.closingSoon} danger={counts.closingSoon > 0} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="relative block">
          <span className="sr-only">Search by title or company</span>
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search title or company"
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-brand-400/50"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="relative">
            <span className="sr-only">Filter by status</span>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as InternshipFilters['status'] }))}
              className="cursor-pointer appearance-none rounded-full border border-white/10 bg-white/[0.04] py-2 pl-3 pr-7 text-[13px] font-semibold text-white/75 outline-none focus:border-brand-400/50"
            >
              <option value="all">All statuses</option>
              {INTERNSHIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          </label>
          <FilterChip on={filters.remoteOnly} onClick={() => setFilters((f) => ({ ...f, remoteOnly: !f.remoteOnly }))}>
            Remote
          </FilterChip>
          <FilterChip on={filters.fundedOnly} onClick={() => setFilters((f) => ({ ...f, fundedOnly: !f.fundedOnly }))}>
            Fully funded
          </FilterChip>
          <FilterChip on={filters.autoOnly} onClick={() => setFilters((f) => ({ ...f, autoOnly: !f.autoOnly }))}>
            Auto-apply
          </FilterChip>
          <FilterChip on={showHidden} onClick={() => setShowHidden((v) => !v)}>
            Show skipped/closed{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
          </FilterChip>
          {filtersActive && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="cursor-pointer px-2 py-2 text-[13px] font-semibold text-white/45 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loadError ? (
        <Message icon={<AlertTriangle size={16} className="text-amber-400" />}>Couldn't load internships: {loadError}</Message>
      ) : items === null ? (
        <Message icon={<Loader2 size={16} className="animate-spin text-white/40" />}>Loading internships…</Message>
      ) : items.length === 0 ? (
        <Message>
          No internships on this account yet. Muse writes them into your account; if it used a different one, they won't
          show up here.
        </Message>
      ) : visibleSections.length === 0 ? (
        <Message>Nothing matches these filters.</Message>
      ) : (
        visibleSections.map((section) => {
          const list = sections[section.id];
          const isCollapsed = collapsed.has(section.id);
          return (
            <section key={section.id} className="flex flex-col gap-1.5">
              <button
                onClick={() => toggleSet(setCollapsed, section.id)}
                aria-expanded={!isCollapsed}
                className="flex cursor-pointer items-baseline gap-2 px-1 text-left"
              >
                <span className="font-mono text-[12px] font-bold uppercase tracking-widest text-white/60">{section.label}</span>
                <span className="font-mono text-[12px] text-white/40">{list.length}</span>
                {section.hint && <span className="hidden truncate text-[12px] text-white/35 sm:inline">{section.hint}</span>}
                <ChevronDown
                  size={13}
                  className={`ml-auto shrink-0 self-center text-white/35 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                />
              </button>
              {!isCollapsed &&
                list.map((item) => (
                  <InternshipRow
                    key={item.id}
                    item={item}
                    expanded={expanded.has(item.id)}
                    onToggleExpand={() => toggleSet(setExpanded, item.id)}
                    save={saves[item.id]}
                    onStatus={(to) => setStatus(item, to)}
                    onNotes={(notes) => void write(item.id, { notes })}
                  />
                ))}
            </section>
          );
        })
      )}

      {undo &&
        createPortal(
          <div
            role="status"
            className="fixed left-1/2 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/12 bg-app/90 px-4 py-3 shadow-lg backdrop-blur-md bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-6"
          >
            <p className="min-w-0 flex-1 truncate text-[13px] text-white/80">
              <span className="font-semibold text-white">{undo.title}</span> → {STATUS_LABEL[undo.to]}
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
    </div>
  );
}

function StatTile({ label, value, accent = false, danger = false }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-1 py-2.5">
      <span className={`text-xl font-extrabold leading-none ${danger ? 'text-red-300' : accent ? 'text-brand-300' : 'text-white'}`}>
        {value}
      </span>
      <span className="mt-1 truncate text-[12px] font-semibold text-white/50">{label}</span>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`cursor-pointer rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors ${
        on ? 'border-brand-400/45 bg-brand-500/20 text-brand-300' : 'border-white/10 bg-white/[0.04] text-white/55 hover:text-white'
      }`}
    >
      {children}
    </button>
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

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function deadlineInfo(text: string): { label: string; tone: 'soon' | 'passed' | 'normal' } | null {
  if (!text) return null;
  const date = parseDeadline(text);
  if (!date) return { label: text, tone: 'normal' };
  const days = daysUntil(date);
  if (days < 0) return { label: `${text} · passed`, tone: 'passed' };
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days} days left`;
  return { label: `${text} · ${when}`, tone: days <= SOON_DAYS ? 'soon' : 'normal' };
}

const ICON_BTN = 'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border transition-colors';

/**
 * One line per internship: score, company, place, stipend, then the link and
 * the four actions as small icons. Tapping the text opens the details
 * (role, deadline, badges, flags, score reason, last email, notes) below it.
 */
function InternshipRow({
  item,
  expanded,
  onToggleExpand,
  save,
  onStatus,
  onNotes,
}: {
  item: Internship;
  expanded: boolean;
  onToggleExpand: () => void;
  save: SaveState | undefined;
  onStatus: (to: InternshipStatus) => void;
  onNotes: (notes: string) => void;
}) {
  const link = safeLink(item.link);
  const deadline = deadlineInfo(item.deadlineText);
  const lowStipend = failsStipendFloor(item);
  const muted = item.status === 'skipped' || item.status === 'closed' || deadline?.tone === 'passed';
  const name = item.org || item.title;
  const place = shortPlace(item.locationMode);
  const stipend = shortStipend(item.stipendText);
  // The row's border doubles as the save indicator: green once saved, red if it failed.
  const border =
    save === 'saved' ? 'border-emerald-400/50' : save === 'error' ? 'border-red-400/60' : expanded ? 'border-white/20' : 'border-white/10';

  return (
    <article className={`rounded-xl border bg-white/[0.03] transition-colors ${border} ${muted ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-1 py-1.5 pl-1.5 pr-1">
        <button
          onClick={onToggleExpand}
          aria-expanded={expanded}
          title={item.title}
          className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg text-left"
        >
          <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-brand-500/15 px-1 font-mono text-[12.5px] font-bold text-brand-300">
            {item.score ?? '-'}
          </span>
          {/* The company shortens first so the place stays visible on a narrow phone. */}
          <span className="flex min-w-0 flex-1 items-center text-[13px] text-white/55">
            {deadline?.tone === 'soon' && (
              <span
                role="img"
                aria-label="Closes within 7 days"
                title="Closes within 7 days"
                className="mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"
              />
            )}
            <span className="min-w-0 truncate">
              <span className="font-semibold text-white">{name}</span>
              {item.org && <span className="hidden sm:inline"> · {item.title}</span>}
            </span>
            {place && <span className="ml-1 max-w-[50%] shrink-0 truncate">· {place}</span>}
          </span>
        </button>

        {stipend && (
          <span
            title={item.floorCheck ? `${item.stipendText} · floor: ${item.floorCheck}` : item.stipendText}
            className={`max-w-[5rem] shrink-0 truncate pl-1 text-[12.5px] font-semibold ${lowStipend ? 'text-red-300' : 'text-white/75'}`}
          >
            {stipend}
          </span>
        )}

        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${name} listing`}
            title="Open listing"
            className={`${ICON_BTN} border-brand-400/30 text-brand-300 hover:bg-brand-500/15`}
          >
            <ExternalLink size={14} />
          </a>
        ) : (
          <span role="img" aria-label="Link missing" title="Link missing" className={`${ICON_BTN} border-white/8 text-white/25`}>
            <Link2Off size={14} />
          </span>
        )}

        <div className="flex shrink-0 gap-0.5 border-l border-white/10 pl-1">
          {ACTIONS.map((a) => {
            const active = item.status === a.status;
            const Icon = a.icon;
            return (
              <button
                key={a.status}
                onClick={() => onStatus(active ? 'to-review' : a.status)}
                aria-pressed={active}
                aria-label={active ? `${a.full} (on). Tap to move back to review` : a.full}
                title={active ? `${a.full}: on. Tap to move back to review` : a.full}
                className={`${ICON_BTN} cursor-pointer ${
                  active
                    ? a.status === 'skipped'
                      ? 'border-white/25 bg-white/15 text-white/85'
                      : 'border-brand-400/45 bg-brand-500/20 text-brand-300'
                    : 'border-white/10 text-white/45 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2.5 border-t border-white/8 px-3 pb-3 pt-2.5">
          <div>
            <p className="text-[14px] font-semibold leading-snug text-white">{item.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-white/55">
              {[item.org, item.locationMode, item.stipendText].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {deadline && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold ${
                  deadline.tone === 'soon' ? 'border-red-400/40 bg-red-500/15 text-red-300' : 'border-white/10 bg-white/[0.05] text-white/60'
                }`}
              >
                {deadline.label}
              </span>
            )}
            {lowStipend && <Badge className="border-red-400/40 bg-red-500/10 text-red-300">Below floor</Badge>}
            {item.status === 'closed' && <Badge className="border-white/15 bg-white/[0.06] text-white/55">Closed</Badge>}
            {item.autoApply && <Badge className="border-brand-400/35 bg-brand-500/10 text-brand-300">One-click</Badge>}
            {item.fullyFunded && <Badge className="border-emerald-400/35 bg-emerald-500/10 text-emerald-300">Fully funded</Badge>}
            {isMayJulWindow(item) && <Badge className="border-amber-400/40 bg-amber-500/10 text-amber-300">May-Jul</Badge>}
            {item.emailStage && (
              <Badge className={STAGE_STYLE[item.emailStage]}>
                <Mail size={10} /> {item.emailStage}
              </Badge>
            )}
          </div>

          {item.flags && <p className="text-[13px] leading-snug text-amber-300/90">{item.flags}</p>}
          {!link && (
            <p className="text-[13px] leading-snug text-white/60">
              <span className="font-bold text-red-300">Link missing. </span>
              {item.link ? 'The saved link was not a normal web address, so it is not opened. ' : ''}
              {item.linkNote}
            </p>
          )}
          {item.scoreReason && (
            <p className="text-[13.5px] leading-relaxed text-white/75">
              <span className="font-bold text-white/85">Score: </span>
              {item.scoreReason}
            </p>
          )}
          {item.emailStage && (
            <p className="text-[13px] leading-snug text-white/65">
              <span className="font-bold text-white/80">Last email: </span>
              {item.lastEmailSubject ?? '(no subject)'}
              {item.lastEmailAt ? ` · ${formatWhen(item.lastEmailAt)}` : ''}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-[12px] text-white/40">
              {STATUS_LABEL[item.status]}
              {item.ref ? ` · ${item.ref}` : ''}
              {item.updatedAt ? ` · updated ${formatWhen(item.updatedAt)}` : ''}
            </p>
            <SaveIndicator save={save} />
          </div>
          <NotesField value={item.notes} onSave={onNotes} />
        </div>
      )}
    </article>
  );
}

function SaveIndicator({ save }: { save: SaveState | undefined }) {
  if (!save) return null;
  if (save === 'saving') return <span className="text-[12px] text-white/40">Saving…</span>;
  if (save === 'error') return <span className="text-[12px] font-semibold text-red-300">Not saved</span>;
  return (
    <span className="flex items-center gap-1 text-[12px] font-semibold text-emerald-300">
      <Check size={11} /> Saved
    </span>
  );
}

/**
 * Keeps a local draft while focused so live updates don't clobber typing;
 * saves on blur. React fires no blur when the card unmounts (a section is
 * collapsed, or Muse moves the entry to another section mid-edit), so an
 * unsaved draft is also flushed on unmount.
 */
function NotesField({ value, onSave }: { value: string; onSave: (notes: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const latest = useRef({ draft, value, onSave });
  latest.current = { draft, value, onSave };

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      const { draft: d, value: v, onSave: save } = latest.current;
      if (focused.current && d !== v) save(d);
    },
    [],
  );

  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-white/40">Notes</span>
      <textarea
        value={draft}
        maxLength={NOTES_MAX}
        rows={3}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          focused.current = false;
          if (draft !== value) onSave(draft);
        }}
        placeholder="Anything to remember about this one. Saves when you tap away."
        className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[14px] leading-snug text-white placeholder:text-white/30 outline-none focus:border-brand-400/50"
      />
    </label>
  );
}
