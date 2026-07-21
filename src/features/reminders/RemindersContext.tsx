import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useReminders, type RemindersApi } from '../../hooks/useReminders';

interface RemindersContextValue extends RemindersApi {
  enabled: boolean;
  toggle: () => void;
}

const STORAGE_KEY = 'ascend_reminders_enabled';

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'; // on by default
  } catch {
    return true;
  }
}

const RemindersContext = createContext<RemindersContextValue | null>(null);

/**
 * Owns the Reminders module's on/off state and its live Firestore-backed data.
 * Disabling stops the listener (and any scheduled alerts) entirely; toggling
 * back on resubscribes. The module is always mounted — toggleable, never
 * deletable — mirroring the ObsidianProvider pattern.
 */
export function RemindersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(loadEnabled());
  const api = useReminders(enabled ? (user?.uid ?? null) : null);

  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const value = useMemo<RemindersContextValue>(() => ({ ...api, enabled, toggle }), [api, enabled]);

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useRemindersContext(): RemindersContextValue {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useRemindersContext must be used within a <RemindersProvider>');
  return ctx;
}
