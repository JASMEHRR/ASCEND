import { useState } from 'react';
import { Bell, Plus, Check, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { useRemindersContext } from './RemindersContext';

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Reminders panel for the dashboard, matching the liquid-glass design language. */
export default function RemindersPanel() {
  const { enabled, pending, addReminder, completeReminder, deleteReminder } = useRemindersContext();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [dueAt, setDueAt] = useState('');

  if (!enabled) return null;

  const submit = async () => {
    if (!text.trim() || !dueAt) return;
    await addReminder(text.trim(), new Date(dueAt).toISOString());
    setText('');
    setDueAt('');
    setOpen(false);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
          <Bell size={12} /> Reminders
        </p>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 cursor-pointer">
          <Plus size={12} /> Add
        </button>
      </div>

      {pending.length === 0 ? (
        <p className="text-[13px] text-white/35">Nothing pending.</p>
      ) : (
        <ul className="space-y-1.5">
          {pending.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 text-[13px] text-white/75">
              <button
                onClick={() => completeReminder(r.id)}
                aria-label={`Complete ${r.text}`}
                className="group flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/25 hover:border-brand-400 transition-colors cursor-pointer"
              >
                <Check size={10} className="opacity-0 group-hover:opacity-100 text-brand-400" />
              </button>
              <span className="flex-1 truncate">{r.text}</span>
              <span className="shrink-0 text-[10px] font-mono text-white/35">{formatDue(r.dueAt)}</span>
              <button
                onClick={() => deleteReminder(r.id)}
                aria-label={`Delete ${r.text}`}
                className="shrink-0 text-white/25 hover:text-red-300 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add reminder" maxWidthClass="max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What to remind"
            className="w-full rounded-xl border border-white/15 bg-[#05070c] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-brand-500/60"
          />
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-[#05070c] px-4 py-3 text-sm text-white outline-none focus:border-brand-500/60"
            aria-label="Due date and time"
          />
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || !dueAt}
              className="px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 border border-brand-500/30 transition-colors cursor-pointer disabled:opacity-40"
            >
              Set reminder
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
