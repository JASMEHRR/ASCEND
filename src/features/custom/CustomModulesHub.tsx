/**
 * "My Modules" — a home for whatever the user (or Jarvis, on their behalf)
 * has built from the fixed set of safe blocks: tracker, counter, list, chart.
 * Nothing here is generated code, so a new module appears the instant it's
 * created and can never break anything else in the app.
 */
import { useState } from 'react';
import { BarChart3, CheckSquare, Hash, ListPlus, Loader2, Plus, Repeat } from 'lucide-react';
import { useDialog } from '../../context/DialogContext';
import ModuleCard from './ModuleCard';
import { useCustomModules } from './useCustomModules';
import type { CustomModuleKind } from './types';

const KIND_INFO: Record<CustomModuleKind, { label: string; blurb: string; icon: typeof CheckSquare }> = {
  tracker: { label: 'Tracker', blurb: 'Daily yes/no, like a habit.', icon: CheckSquare },
  counter: { label: 'Counter', blurb: 'A running total you bump up or down.', icon: Hash },
  list: { label: 'List', blurb: 'A simple checklist.', icon: ListPlus },
  chart: { label: 'Chart', blurb: 'Log a number over time.', icon: BarChart3 },
};

export default function CustomModulesHub() {
  const { modules, loading, add, remove } = useCustomModules();
  const { confirm } = useDialog();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CustomModuleKind>('tracker');

  const create = async () => {
    if (!title.trim()) return;
    const mod = await add({ title, kind });
    if (mod) {
      setTitle('');
      setCreating(false);
    }
  };

  const onDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      message: 'Removes the module and everything logged in it. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await remove(id);
  };

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/25" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-white">My Modules</h2>
          <p className="text-[11.5px] text-white/40">
            Ask Jarvis to build one, or add it yourself — no coding, appears instantly.
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-[11px] font-bold text-black transition-all hover:bg-brand-400 cursor-pointer"
        >
          <Plus size={14} /> New module
        </button>
      </div>

      {creating && (
        <div className="space-y-3 rounded-3xl border border-brand-400/25 bg-brand-500/5 p-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. Push-ups counter"
            className="liquid-glass-input w-full rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(KIND_INFO) as CustomModuleKind[]).map((k) => {
              const info = KIND_INFO[k];
              const Icon = info.icon;
              const active = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`space-y-1 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                    active ? 'border-brand-400/40 bg-brand-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20'
                  }`}
                >
                  <Icon size={15} />
                  <span className="block text-[11.5px] font-bold">{info.label}</span>
                  <span className="block text-[10px] leading-snug text-white/40">{info.blurb}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreating(false)}
              className="rounded-xl border border-white/10 px-3.5 py-2 text-[11.5px] font-semibold text-white/50 hover:text-white/85 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={!title.trim()}
              className="rounded-xl bg-brand-500 px-4 py-2 text-[11.5px] font-bold text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {modules.length === 0 && !creating && (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 text-center">
          <Repeat size={26} className="text-white/20" />
          <p className="text-[12px] text-white/35">No custom modules yet — say "add a module for X" to Jarvis, or create one above.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <ModuleCard key={m.id} module={m} onDelete={() => onDelete(m.id, m.title)} />
        ))}
      </div>
    </div>
  );
}
