import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, AlertTriangle, Info, X } from 'lucide-react';

export type ToastKind = 'insight' | 'warning' | 'info';

interface ToastInput {
  kind?: ToastKind;
  title?: string;
  message: string;
  /** ms before auto-dismiss (default 7000). */
  duration?: number;
}

interface Toast extends Required<Omit<ToastInput, 'title'>> {
  id: string;
  title?: string;
}

interface ToastValue {
  show: (t: ToastInput) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const ICONS: Record<ToastKind, typeof Sparkles> = { insight: Sparkles, warning: AlertTriangle, info: Info };

/** Liquid-glass toast stack (top-right). Insights, alerts, gentle nudges. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (input: ToastInput) => {
      const toast: Toast = {
        id: crypto.randomUUID(),
        kind: input.kind ?? 'info',
        title: input.title,
        message: input.message,
        duration: input.duration ?? 7000,
      };
      setToasts((ts) => [...ts.slice(-2), toast]); // never stack more than 3
      window.setTimeout(() => dismiss(toast.id), toast.duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.kind];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="pointer-events-auto liquid-glass-highlight flex items-start gap-2.5 rounded-2xl p-3.5"
              >
                <Icon
                  size={15}
                  className={`mt-0.5 shrink-0 ${t.kind === 'insight' ? 'text-brand-400' : t.kind === 'warning' ? 'text-amber-400' : 'text-white/60'}`}
                />
                <div className="min-w-0 flex-1">
                  {t.title && <p className="text-[12px] font-bold text-white">{t.title}</p>}
                  <p className="text-[12px] leading-snug text-white/75">{t.message}</p>
                </div>
                <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 rounded-full p-1 text-white/35 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
                  <X size={12} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}
