import { Bell, BellOff } from 'lucide-react';
import { useRemindersContext } from './RemindersContext';

/** Enable/disable the Reminders module. Lives inside the Settings modal. */
export default function RemindersSettings() {
  const { enabled, toggle } = useRemindersContext();

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Reminders</span>
      </div>
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[12px] font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          {enabled ? <Bell size={14} className="text-brand-400" /> : <BellOff size={14} className="text-white/40" />}
          {enabled ? 'Reminders on' : 'Reminders off'}
        </span>
        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${enabled ? 'text-brand-400' : 'text-white/40'}`}>
          {enabled ? 'Disable' : 'Enable'}
        </span>
      </button>
    </section>
  );
}
