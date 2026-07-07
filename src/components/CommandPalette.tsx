import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Search, CornerDownLeft } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  /** Extra searchable text (e.g. a group name or synonyms). */
  hint?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void;
}

/**
 * Subsequence fuzzy match: every char of `q` must appear in order in `text`.
 * Returns a score (lower = better: earlier + tighter matches win) or null.
 */
function fuzzyScore(text: string, q: string): number | null {
  if (!q) return 0;
  const t = text.toLowerCase();
  let ti = 0;
  let score = 0;
  let prev = -1;
  for (const ch of q.toLowerCase()) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    score += found + (prev >= 0 ? found - prev : 0); // reward early + adjacent hits
    prev = found;
    ti = found + 1;
  }
  return score;
}

interface Props {
  commands: Command[];
}

/**
 * Cmd/Ctrl+K command palette: fuzzy view-switching + quick actions. Portal-based
 * with a focus trap and Esc-to-close. Complements the Cmd/Ctrl+J Jarvis launcher
 * (JarvisLauncher) — different key, different job.
 */
export default function CommandPalette({ commands }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global Cmd/Ctrl+K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset state each time it opens and move focus into the input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: fuzzyScore(`${c.label} ${c.hint ?? ''}`, query.trim()) }))
      .filter((x): x is { c: Command; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s);
    return scored.map((x) => x.c);
  }, [commands, query]);

  // Keep the active index in range as results shrink.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  const close = useCallback(() => setOpen(false), []);

  const runAt = useCallback(
    (i: number) => {
      const cmd = results[i];
      if (!cmd) return;
      close();
      cmd.run();
    },
    [results, close],
  );

  // Navigation keys are handled on the document (not a portal onKeyDown, which
  // React does not reliably deliver for content portalled outside the root).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runAt(active);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close, results.length, active, runAt]);

  // Scroll the active row into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  return createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-[15vh]"
          onClick={close}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-surface/95 shadow-[0_30px_60px_rgba(0,0,0,0.8)]"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-white/8 px-4">
              <Search size={16} className="text-white/40 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Jump to a view or run an action…"
                aria-label="Search commands"
                className="w-full bg-transparent py-4 text-[15px] text-white outline-none placeholder:text-white/30"
              />
            </div>
            <div ref={listRef} className="max-h-[46vh] overflow-y-auto custom-scrollbar p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-white/35">No matching commands.</p>
              ) : (
                results.map((cmd, i) => {
                  const Icon = cmd.icon;
                  const isActive = i === active;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={i}
                      onClick={() => runAt(i)}
                      onMouseMove={() => setActive(i)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors cursor-pointer ${
                        isActive ? 'bg-white/10 text-white' : 'text-white/60'
                      }`}
                    >
                      {Icon && <Icon size={15} className={isActive ? 'text-brand-300' : 'text-white/40'} />}
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {isActive && <CornerDownLeft size={13} className="text-white/30" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>,
    document.body,
  );
}
