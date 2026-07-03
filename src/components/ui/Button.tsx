import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500/15 text-brand-300 border border-brand-500/30 hover:bg-brand-500/25 disabled:opacity-40',
  secondary:
    'bg-white/5 text-white/80 border border-white/12 hover:bg-white/10 hover:text-white disabled:opacity-40',
  ghost: 'text-white/55 hover:text-white border border-transparent disabled:opacity-40',
};

/** Shared ASCEND button: glassy, rounded, with an optional loading spinner. */
export default function Button({ variant = 'primary', loading = false, className = '', children, disabled, ...props }: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
