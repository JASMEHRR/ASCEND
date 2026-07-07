import type { ReactNode } from 'react';

export default function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center opacity-70">
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-white/40">{icon}</div>
      <p className="text-[12px] font-bold uppercase tracking-widest text-white/60">{title}</p>
      <p className="text-[11px] text-white/35 max-w-[240px] leading-relaxed">{hint}</p>
    </div>
  );
}
