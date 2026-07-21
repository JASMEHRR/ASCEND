import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ObsidianClient, type ObsidianConfig } from './obsidianClient';

type Status = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ObsidianContextValue {
  status: Status;
  connected: boolean;
  config: ObsidianConfig | null;
  error: string | null;
  client: ObsidianClient | null;
  connect: (config: ObsidianConfig) => Promise<boolean>;
  disconnect: () => void;
}

const LEGACY_STORAGE_KEY = 'ascend_obsidian_config';
/** Per-user credential isolation: each account gets its own vault config. */
const storageKey = (uid: string) => `ascend_obsidian_config_${uid}`;

function loadConfig(uid: string | null): ObsidianConfig | null {
  if (!uid) return null;
  try {
    // One-time migration: a pre-isolation config belonged to this device's
    // owner — claim it for the first signed-in account, then drop the shared
    // key so no other account can inherit these credentials.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && !localStorage.getItem(storageKey(uid))) {
      localStorage.setItem(storageKey(uid), legacy);
    }
    if (legacy) localStorage.removeItem(LEGACY_STORAGE_KEY);

    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c?.baseUrl && c?.apiKey ? c : null;
  } catch {
    return null;
  }
}

const ObsidianContext = createContext<ObsidianContextValue | null>(null);

/**
 * Holds the Obsidian connection. Config lives in local storage as a
 * **per-user** credential (URL + API key for the user's own localhost plugin)
 * — one account's Jarvis can never read another account's vault. Switching
 * users swaps to that user's saved config; disconnecting clears it and
 * unregisters the Jarvis tools.
 */
export function ObsidianProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [config, setConfig] = useState<ObsidianConfig | null>(null);
  const [status, setStatus] = useState<Status>('disconnected');
  const [error, setError] = useState<string | null>(null);

  // Load (or clear) this user's saved connection whenever the account changes.
  // Start optimistically "connected" when config exists; explicit connect() re-pings.
  useEffect(() => {
    const saved = loadConfig(uid);
    setConfig(saved);
    setStatus(saved ? 'connected' : 'disconnected');
    setError(null);
  }, [uid]);

  const client = useMemo(() => (config ? new ObsidianClient(config) : null), [config]);

  const connect = useCallback(
    async (next: ObsidianConfig) => {
      if (!uid) {
        setError('Sign in before connecting a vault.');
        setStatus('error');
        return false;
      }
      setStatus('connecting');
      setError(null);
      try {
        await new ObsidianClient(next).ping();
        localStorage.setItem(storageKey(uid), JSON.stringify(next));
        setConfig(next);
        setStatus('connected');
        return true;
      } catch (e) {
        setError((e as Error).message || 'Could not reach Obsidian. Is the Local REST API plugin running?');
        setStatus('error');
        return false;
      }
    },
    [uid],
  );

  const disconnect = useCallback(() => {
    if (uid) localStorage.removeItem(storageKey(uid));
    setConfig(null);
    setStatus('disconnected');
    setError(null);
  }, [uid]);

  const value = useMemo<ObsidianContextValue>(
    () => ({ status, connected: status === 'connected', config, error, client, connect, disconnect }),
    [status, config, error, client, connect, disconnect],
  );

  return <ObsidianContext.Provider value={value}>{children}</ObsidianContext.Provider>;
}

export function useObsidian(): ObsidianContextValue {
  const ctx = useContext(ObsidianContext);
  if (!ctx) throw new Error('useObsidian must be used within an <ObsidianProvider>');
  return ctx;
}
