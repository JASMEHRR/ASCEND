import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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

const STORAGE_KEY = 'ascend_obsidian_config';

function loadConfig(): ObsidianConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c?.baseUrl && c?.apiKey ? c : null;
  } catch {
    return null;
  }
}

const ObsidianContext = createContext<ObsidianContextValue | null>(null);

/**
 * Holds the Obsidian connection. Config lives in local storage (a per-device
 * secret for the user's own localhost plugin) and can be enabled/disabled
 * cleanly — disconnecting clears it and unregisters the Jarvis tools.
 */
export function ObsidianProvider({ children }: { children: ReactNode }) {
  const initial = loadConfig();
  const [config, setConfig] = useState<ObsidianConfig | null>(initial);
  // Start optimistically "connected" if we have saved config; the registrar
  // will re-validate lazily. Explicit connect() re-pings.
  const [status, setStatus] = useState<Status>(initial ? 'connected' : 'disconnected');
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => (config ? new ObsidianClient(config) : null), [config]);

  const connect = useCallback(async (next: ObsidianConfig) => {
    setStatus('connecting');
    setError(null);
    try {
      await new ObsidianClient(next).ping();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setConfig(next);
      setStatus('connected');
      return true;
    } catch (e) {
      setError((e as Error).message || 'Could not reach Obsidian. Is the Local REST API plugin running?');
      setStatus('error');
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(null);
    setStatus('disconnected');
    setError(null);
  }, []);

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
