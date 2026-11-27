/**
 * JasMehr's own reel categories (Anime, Claude...) and the Work / Personal
 * split: the switch at the top of the Reels page, the sheet that puts one reel
 * into categories, and the panel to manage categories and divisions.
 * Display only; the Reels page passes the data and the writes in.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Check, Home, Plus, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { CAT_NAME_MAX, divisionSide, sortCategories, type SideFilter } from './logic';
import { REEL_BUCKETS, type DivisionSides, type LifeSide, type ReelBucket, type ReelCategory, type Side } from './types';

export const SIDE_LABEL: Record<Side, string> = { work: 'Work', personal: 'Personal', claude: 'Claude' };
const SIDE_ICON: Record<Side, typeof Briefcase> = { work: Briefcase, personal: Home, claude: Sparkles };
const SIDE_ON: Record<Side, string> = {
  work: 'bg-brand-500/25 text-brand-300',
  personal: 'bg-violet-500/25 text-violet-200',
  claude: 'bg-orange-500/25 text-orange-200',
};

/** All / Work / Personal / Claude for the whole Reels page, with how many reels each shows. */
export function SideSwitch({ value, onChange, counts }: { value: SideFilter; onChange: (v: SideFilter) => void; counts: Record<SideFilter, number> }) {
  const opts: SideFilter[] = ['all', 'work', 'personal', 'claude'];
  return (
    <div role="radiogroup" aria-label="Show all, work, personal or Claude reels" className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
      {opts.map((o) => {
        const on = value === o;
        const Icon = o === 'all' ? null : SIDE_ICON[o];
        return (
          <button
            key={o}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={`flex min-w-0 cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[13px] font-bold transition-colors sm:flex-row sm:gap-1.5 sm:py-2 ${
              on ? (o === 'all' ? 'bg-white/10 text-white' : SIDE_ON[o]) : 'text-white/55 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-1">
              {Icon && <Icon size={13} className="shrink-0" />}
              {o === 'all' ? 'All' : SIDE_LABEL[o]}
            </span>
            <span className={`font-mono text-[11.5px] ${on ? 'opacity-80' : 'text-white/35'}`}>{counts[o]}</span>
          </button>
        );
      })}
    </div>
  );
}

const ALL_SIDES: Side[] = ['work', 'personal', 'claude'];
const LIFE_SIDES: LifeSide[] = ['work', 'personal'];

/** Small Work | Personal (| Claude) picker used inside the panels. */
function SidePicker<S extends Side>({
  value,
  onChange,
  label,
  options,
}: {
  value: S;
  onChange: (s: S) => void;
  label: string;
  options: S[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-bold transition-colors ${
            value === s ? SIDE_ON[s] : 'text-white/45 hover:text-white'
          }`}
        >
          {SIDE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

export function SideBadge({ side }: { side: Side }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
        side === 'work' ? 'bg-brand-500/15 text-brand-300' : side === 'personal' ? 'bg-violet-500/15 text-violet-300' : 'bg-orange-500/15 text-orange-300'
      }`}
    >
      {SIDE_LABEL[side]}
    </span>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-2xl border border-white/12 bg-app shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">{title}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto p-4 custom-scrollbar">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Name + side + Add. Used to make a new category from either panel. */
function NewCategoryForm({ onCreate, cta }: { onCreate: (name: string, side: Side) => Promise<unknown>; cta: string }) {
  const [name, setName] = useState('');
  const [side, setSide] = useState<Side>('personal');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name, side);
      setName('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-dashed border-white/15 p-3">
      <p className="text-[12px] font-bold uppercase tracking-wide text-white/45">New category</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={CAT_NAME_MAX}
        placeholder="e.g. Anime, Claude, Gym"
        aria-label="Category name"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-brand-400/50"
      />
      <div className="flex items-center gap-2">
        <SidePicker value={side} onChange={setSide} label="New category is work, personal or a Claude section" options={ALL_SIDES} />
        <span className="flex-1" />
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-400/40 bg-brand-500/20 px-3.5 py-2 text-[13px] font-bold text-brand-300 hover:bg-brand-500/30 disabled:cursor-default disabled:opacity-40"
        >
          <Plus size={14} /> {cta}
        </button>
      </div>
    </form>
  );
}

/** Puts one reel into (or out of) his categories. */
export function CategorySheet({
  reelTitle,
  cats,
  inCats,
  onToggle,
  onCreate,
  onClose,
}: {
  reelTitle: string;
  cats: ReelCategory[];
  inCats: Set<string>;
  onToggle: (cat: ReelCategory, on: boolean) => void;
  onCreate: (name: string, side: Side) => Promise<unknown>;
  onClose: () => void;
}) {
  return (
    <Sheet title="Put this reel in…" onClose={onClose}>
      <p className="-mt-1 line-clamp-2 text-[13px] text-white/55">{reelTitle}</p>
      {cats.length === 0 ? (
        <p className="text-[13px] text-white/50">No categories yet. Make one below; this reel goes straight into it.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sortCategories(cats).map((c) => {
            const on = inCats.has(c.id);
            return (
              <li key={c.id}>
                <button
                  onClick={() => onToggle(c, !on)}
                  aria-pressed={on}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-brand-400/45 bg-brand-500/[0.12]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-brand-400 bg-brand-500 text-white' : 'border-white/25'}`}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{c.name}</span>
                  <SideBadge side={c.side} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <NewCategoryForm onCreate={onCreate} cta="Add + put it here" />
    </Sheet>
  );
}

/** Make, re-side, rename or delete his categories, and move Muse's divisions between Work and Personal. */
export function ManageCategories({
  cats,
  counts,
  divisionSides,
  onCreate,
  onSide,
  onRename,
  onDelete,
  onDivisionSide,
  onClose,
}: {
  cats: ReelCategory[];
  counts: Map<string, number>;
  divisionSides: DivisionSides;
  onCreate: (name: string, side: Side) => Promise<unknown>;
  onSide: (cat: ReelCategory, side: Side) => void;
  onRename: (cat: ReelCategory, name: string) => void;
  onDelete: (cat: ReelCategory) => void;
  onDivisionSide: (bucket: ReelBucket, side: LifeSide) => void;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <Sheet title="Categories" onClose={onClose}>
      <section className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wide text-white/45">Your categories</p>
        {cats.length === 0 && <p className="text-[13px] text-white/50">None yet. A reel can be in several; each category is Work, Personal, or a Claude section.</p>}
        {sortCategories(cats).map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <Tag size={14} className="shrink-0 text-white/35" />
            <input
              defaultValue={c.name}
              maxLength={CAT_NAME_MAX}
              aria-label={`Rename ${c.name}`}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && onRename(c, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white outline-none focus:underline"
            />
            <span className="font-mono text-[12px] text-white/40">{counts.get(c.id) ?? 0}</span>
            <SidePicker value={c.side} onChange={(s) => onSide(c, s)} label={`${c.name} is work, personal or Claude`} options={ALL_SIDES} />
            {confirmId === c.id ? (
              <button
                onClick={() => {
                  setConfirmId(null);
                  onDelete(c);
                }}
                className="cursor-pointer rounded-full border border-red-400/40 bg-red-500/20 px-2.5 py-1 text-[12px] font-bold text-red-200"
              >
                Delete?
              </button>
            ) : (
              <button
                onClick={() => setConfirmId(c.id)}
                aria-label={`Delete category ${c.name}`}
                title="Delete category (reels stay)"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/35 hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <NewCategoryForm onCreate={onCreate} cta="Add" />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wide text-white/45">Muse's divisions</p>
        <p className="-mt-1 text-[12.5px] leading-snug text-white/45">
          A reel with none of your categories follows its division. Your categories win when a reel has one.
        </p>
        {REEL_BUCKETS.map((b) => (
          <div key={b} className="flex items-center gap-2 px-1">
            <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{b}</span>
            <SidePicker value={divisionSide(b, divisionSides)} onChange={(s) => onDivisionSide(b, s)} label={`${b} is work or personal`} options={LIFE_SIDES} />
          </div>
        ))}
      </section>
    </Sheet>
  );
}
