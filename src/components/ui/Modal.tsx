import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Max width class (Tailwind), defaults to a comfortable dialog width. */
  maxWidthClass?: string;
  /** Hide the default close (X) button in the header. */
  hideClose?: boolean;
}

/**
 * Accessible base modal: focus is moved inside on open, Escape and backdrop
 * clicks close it, and it is announced as a dialog to assistive tech.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg',
  hideClose = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the panel for keyboard/screen-reader users.
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, button, [href], select',
      );
      focusable?.focus();
    }, 40);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'Dialog'}
            className={`relative w-full ${maxWidthClass} bg-[#0b0d13]/95 text-[#f4f4f5] border border-white/12 rounded-[1.75rem] shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || !hideClose) && (
              <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-white/8">
                <h2 className="text-sm font-bold tracking-tight text-white">{title}</h2>
                {!hideClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )}
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
