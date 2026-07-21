import { useState } from 'react';
import { motion } from 'motion/react';
import { CalendarClock, Check, X, Loader2 } from 'lucide-react';
import type { OSState } from '../../types';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import { useGoogle } from '../google/GoogleContext';
import { createEvent, todayAt } from '../google/calendarClient';
import { usePlanning } from './PlanningContext';

interface Props {
  updateState: (updater: (prev: OSState) => OSState) => void;
}

/**
 * The approve/reject gate of AI Daily Planning. Shown on the dashboard while a
 * Jarvis-proposed plan is pending. Approval syncs the blocks to Google
 * Calendar when connected, otherwise files them as tasks — rejection just
 * discards. Jarvis never applies a plan on its own.
 */
export default function PlanApprovalCard({ updateState }: Props) {
  const { pending, clear } = usePlanning();
  const { memory, greet } = useJarvis();
  const google = useGoogle();
  const [applying, setApplying] = useState(false);

  if (!pending) return null;

  const approve = async () => {
    setApplying(true);
    let synced = 0;
    let failed = 0;
    const token = google.connected ? await google.getToken() : null;

    if (token) {
      for (const b of pending.blocks) {
        const start = todayAt(b.start);
        const end = todayAt(b.end);
        if (!start || !end) {
          failed++;
          continue;
        }
        try {
          await createEvent(token, { title: b.title, start, end, description: b.notes });
          synced++;
        } catch {
          failed++;
        }
      }
    } else {
      // No calendar: file blocks as tasks so the plan still lands somewhere real.
      updateState((p) => ({
        ...p,
        tasks: [
          ...p.tasks,
          ...pending.blocks.map((b) => ({ id: crypto.randomUUID(), text: `${b.start} ${b.title}`, done: false })),
        ],
      }));
      synced = pending.blocks.length;
    }

    memory.recordAction({
      tool: 'approveDayPlan',
      module: 'Planning',
      summary: token
        ? `day plan approved — ${synced} event${synced === 1 ? '' : 's'} synced to Google Calendar${failed ? `, ${failed} failed` : ''}`
        : `day plan approved — ${synced} block${synced === 1 ? '' : 's'} filed as tasks (calendar not connected)`,
      ok: failed === 0,
      at: new Date().toISOString(),
    });
    greet(
      token
        ? `Plan locked in, sir. ${synced} block${synced === 1 ? '' : 's'} on the calendar${failed ? `; ${failed} failed to sync` : ''}.`
        : `Plan approved. I filed ${synced} block${synced === 1 ? '' : 's'} as tasks — connect Google Calendar in Settings for real scheduling.`,
    );
    setApplying(false);
    clear();
  };

  const reject = () => {
    memory.recordAction({ tool: 'rejectDayPlan', module: 'Planning', summary: 'day plan rejected', ok: true, at: new Date().toISOString() });
    clear();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-highlight rounded-[1.5rem] p-4"
      role="region"
      aria-label="Proposed day plan awaiting approval"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">
        <CalendarClock size={12} /> Proposed day plan — needs your approval
      </p>
      {pending.rationale && <p className="mt-1 text-[11.5px] text-white/45">{pending.rationale}</p>}
      <ul className="mt-2.5 space-y-1">
        {pending.blocks.map((b, i) => (
          <li key={i} className="flex items-baseline gap-2.5 text-[12.5px]">
            <span className="shrink-0 font-mono text-[11px] text-white/45">
              {b.start}–{b.end}
            </span>
            <span className="font-semibold text-white/85">{b.title}</span>
            {b.notes && <span className="truncate text-[11px] text-white/35">{b.notes}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          onClick={approve}
          disabled={applying}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-400/30 bg-brand-500/20 py-2 text-[11px] font-bold uppercase tracking-wider text-brand-300 hover:bg-brand-500/30 transition-colors cursor-pointer disabled:opacity-50"
        >
          {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {google.connected ? 'Approve & sync to Calendar' : 'Approve as tasks'}
        </button>
        <button
          onClick={reject}
          disabled={applying}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white/50 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          <X size={12} /> Reject
        </button>
      </div>
    </motion.div>
  );
}
