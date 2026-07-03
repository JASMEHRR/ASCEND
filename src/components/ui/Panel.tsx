import type { ReactNode } from 'react';

/** Glass surface used across the Launch feature — ASCEND's glassmorphism card. */
export default function Panel({
  children,
  className = '',
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border bg-white/[0.03] backdrop-blur-xl p-5 shadow-[0_8px_28px_rgba(0,0,0,0.35)] ${
        accent ? 'border-brand-500/25' : 'border-white/10'
      } ${className}`}
    >
      {children}
    </div>
  );
}
