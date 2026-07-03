import type { ReactNode } from 'react';
import { Loader2, BookOpen, AlertTriangle } from 'lucide-react';

export function SectionHeader({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <p className="text-[10px] font-mono font-black uppercase tracking-[0.22em] text-brand-400">{kicker}</p>
      <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{title}</h2>
      {subtitle && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/50">{subtitle}</p>}
    </header>
  );
}

export function FrameworkNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-brand-400">
        <BookOpen size={12} /> {title}
      </p>
      <div className="mt-1.5 text-[13px] leading-relaxed text-white/70">{children}</div>
    </aside>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <aside className="flex gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-[13px] leading-relaxed text-white/70">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
      <p>
        <span className="font-bold text-amber-300">70–80% rule:</span> {children}
      </p>
    </aside>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300" role="alert">
      {message}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-white/50">
      <Loader2 size={18} className="animate-spin text-brand-400" />
      <span className="text-[13px]">{label}</span>
    </div>
  );
}

export const inputCls =
  'w-full rounded-xl border border-white/12 bg-[#05070c] px-4 py-3 text-[13px] text-white placeholder:text-white/25 outline-none focus:border-brand-500/60';

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-white/8 text-white/60' },
  messaged: { label: 'Messaged', cls: 'bg-amber-500/15 text-amber-300' },
  loom_sent: { label: 'Loom sent', cls: 'bg-sky-500/15 text-sky-300' },
  replied: { label: 'Replied', cls: 'bg-brand-500/15 text-brand-300' },
  call_booked: { label: 'Call booked', cls: 'bg-brand-500 text-black' },
};

export function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
  );
}
