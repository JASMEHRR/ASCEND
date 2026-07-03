import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import Modal from '../components/ui/Modal';

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  multiline?: boolean;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface DialogContextValue {
  /** Resolves to the entered string, or null if cancelled. */
  prompt: (options: PromptOptions) => Promise<string | null>;
  /** Resolves to true if confirmed, false if cancelled. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

type PromptState = PromptOptions & { kind: 'prompt' };
type ConfirmState = ConfirmOptions & { kind: 'confirm' };
type DialogState = PromptState | ConfirmState;

/**
 * Provides accessible, promise-based `prompt()` and `confirm()` dialogs that
 * replace the browser's blocking native equivalents. A single modal is rendered
 * at the app root; callers simply `await` the result.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const resolverRef = useRef<((value: string | null | boolean) => void) | null>(null);

  const close = useCallback((result: string | null | boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    setInputValue(options.initialValue ?? '');
    setDialog({ kind: 'prompt', ...options });
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve as (value: string | null | boolean) => void;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog({ kind: 'confirm', ...options });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve as (value: string | null | boolean) => void;
    });
  }, []);

  const value = useMemo<DialogContextValue>(() => ({ prompt, confirm }), [prompt, confirm]);

  const isPrompt = dialog?.kind === 'prompt';

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal
        open={dialog !== null}
        onClose={() => close(isPrompt ? null : false)}
        title={dialog?.title}
      >
        {dialog && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isPrompt) close(inputValue.trim() ? inputValue.trim() : null);
              else close(true);
            }}
            className="space-y-5"
          >
            {dialog.message && (
              <p className="text-[13px] leading-relaxed text-white/60">{dialog.message}</p>
            )}

            {isPrompt &&
              (dialog.multiline ? (
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={dialog.placeholder}
                  rows={4}
                  className="w-full bg-[#05070c] border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-brand-500/60 resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={dialog.placeholder}
                  className="w-full bg-[#05070c] border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-brand-500/60"
                />
              ))}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => close(isPrompt ? null : false)}
                className="px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
              >
                {(!isPrompt && (dialog as ConfirmState).cancelLabel) || 'Cancel'}
              </button>
              <button
                type="submit"
                className={`px-4 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                  !isPrompt && (dialog as ConfirmState).danger
                    ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border-red-500/25'
                    : 'bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 border-brand-500/30'
                }`}
              >
                {(isPrompt ? dialog.confirmLabel : (dialog as ConfirmState).confirmLabel) || (isPrompt ? 'Save' : 'Confirm')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a <DialogProvider>');
  return ctx;
}
