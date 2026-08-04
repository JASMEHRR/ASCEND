/**
 * Renders one custom module by kind. Every kind shares the same CustomEntry
 * shape underneath (see types.ts) — this is the only place that branches on
 * what a module actually looks like.
 */
import { useEffect, useState } from 'react';
import { Check, Minus, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { addEntry, deleteEntry, subscribeEntries, updateEntry } from './data';
import type { CustomEntry, CustomModule, CounterConfig, TrackerConfig } from './types';

export default function ModuleCard({ module, onDelete }: { module: CustomModule; onDelete: () => void }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [entries, setEntries] = useState<CustomEntry[]>([]);

  useEffect(() => {
    if (!uid) return;
    return subscribeEntries(uid, module.id, setEntries);
  }, [uid, module.id]);

  return (
    <div className="space-y-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-white/90">{module.title}</span>
          <span className="block font-mono text-[9.5px] uppercase tracking-widest text-white/30">{module.kind}</span>
        </span>
        <button
          onClick={onDelete}
          aria-label={`Delete ${module.title}`}
          className="shrink-0 rounded-lg p-1.5 text-white/25 transition-colors hover:bg-white/10 hover:text-red-400 cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {uid && module.kind === 'tracker' && <TrackerBody uid={uid} module={module} entries={entries} />}
      {uid && module.kind === 'counter' && <CounterBody uid={uid} module={module} entries={entries} />}
      {uid && module.kind === 'list' && <ListBody uid={uid} module={module} entries={entries} />}
      {uid && module.kind === 'chart' && <ChartBody entries={entries} />}
    </div>
  );
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** tracker: one tap logs today's entry, same one-tile-per-day feel as Arena. */
function TrackerBody({ uid, module, entries }: { uid: string; module: CustomModule; entries: CustomEntry[] }) {
  const cfg = module.config as TrackerConfig;
  const target = cfg.target && cfg.target > 0 ? cfg.target : 1;
  const today = todayStr();
  const todayEntry = entries.find((e) => e.at.slice(0, 10) === today);
  const done = (todayEntry?.value ?? 0) >= target;

  const toggle = async () => {
    if (todayEntry) await deleteEntry(uid, module.id, todayEntry.id);
    else await addEntry(uid, module.id, { value: target, at: new Date().toISOString() });
  };

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return entries.some((e) => e.at.slice(0, 10) === key && (e.value ?? 0) >= target);
  });

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        aria-pressed={done}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
          done ? 'border-brand-400 bg-brand-400 text-black' : 'border-white/25 hover:border-white/50'
        }`}
      >
        {done && <Check size={15} strokeWidth={4} />}
      </button>
      <div className="flex gap-1">
        {last7.map((hit, i) => (
          <span key={i} className={`h-4 w-4 rounded-[4px] ${hit ? 'bg-brand-400/70' : 'bg-white/8'}`} />
        ))}
      </div>
    </div>
  );
}

/** counter: a running total the user bumps up/down, no daily reset. */
function CounterBody({ uid, module, entries }: { uid: string; module: CustomModule; entries: CustomEntry[] }) {
  const cfg = module.config as CounterConfig;
  const step = cfg.step && cfg.step > 0 ? cfg.step : 1;
  const total = (cfg.startAt ?? 0) + entries.reduce((n, e) => n + (e.value ?? 0), 0);

  const bump = async (delta: number) => {
    await addEntry(uid, module.id, { value: delta, at: new Date().toISOString() });
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-2xl font-extrabold text-white">{total}</span>
      <div className="flex gap-1.5">
        <button
          onClick={() => bump(-step)}
          aria-label="Decrease"
          className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => bump(step)}
          aria-label="Increase"
          className="rounded-lg bg-brand-500 p-2 text-black transition-colors hover:bg-brand-400 cursor-pointer"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** list: a simple checklist — add an item, check it off, remove it. */
function ListBody({ uid, module, entries }: { uid: string; module: CustomModule; entries: CustomEntry[] }) {
  const [text, setText] = useState('');

  const add = async () => {
    const label = text.trim();
    if (!label) return;
    setText('');
    await addEntry(uid, module.id, { label, done: false, at: new Date().toISOString() });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add an item…"
          className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-[12.5px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
        />
        <button
          onClick={add}
          disabled={!text.trim()}
          className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
            <button
              onClick={() => updateEntry(uid, module.id, e.id, { done: !e.done })}
              aria-pressed={!!e.done}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer ${
                e.done ? 'border-brand-400 bg-brand-400 text-black' : 'border-white/25'
              }`}
            >
              {e.done && <Check size={10} strokeWidth={4} />}
            </button>
            <span className={`min-w-0 flex-1 truncate text-[12.5px] ${e.done ? 'text-white/35 line-through' : 'text-white/85'}`}>
              {e.label}
            </span>
            <button
              onClick={() => deleteEntry(uid, module.id, e.id)}
              aria-label="Remove item"
              className="shrink-0 rounded p-1 text-white/25 hover:text-red-400 cursor-pointer"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        {entries.length === 0 && <p className="py-2 text-center text-[11px] text-white/25">Nothing yet.</p>}
      </div>
    </div>
  );
}

/** chart: values logged over time, shown as a plain sparkline bar row. */
function ChartBody({ entries }: { entries: CustomEntry[] }) {
  const points = [...entries].reverse().slice(-20);
  const max = Math.max(1, ...points.map((e) => e.value ?? 0));

  if (points.length === 0) {
    return <p className="py-2 text-center text-[11px] text-white/25">No values logged yet.</p>;
  }

  return (
    <div className="flex h-16 items-end gap-1">
      {points.map((e, i) => (
        <span
          key={e.id ?? i}
          title={`${e.value ?? 0}`}
          className="min-w-[6px] flex-1 rounded-t bg-brand-400/60"
          style={{ height: `${Math.max(4, ((e.value ?? 0) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
