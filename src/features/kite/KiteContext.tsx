import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';

export type KiteStatus = 'disconnected' | 'connected' | 'expired';

interface KiteContextValue {
  status: KiteStatus;
  connected: boolean;
  token: string | null;
  /** Error from the last login attempt (from the #kite_error handoff). */
  loginError: string | null;
  /** Kick off the server-side login flow (full-page redirect to Zerodha). */
  connect: () => void;
  disconnect: () => void;
  /** Called when a Kite call hits the daily token expiry. */
  markExpired: () => void;
  /** Dev escape hatch: Kite allows one redirect URL (production), so local
   * testing pastes a token generated on the deployed app. */
  setTokenManually: (token: string) => void;
}

/** Per-user credential isolation, same pattern as the Obsidian connector. */
const storageKey = (uid: string) => `ascend_kite_token_${uid}`;

const ERROR_COPY: Record<string, string> = {
  denied: 'Zerodha login was cancelled or denied.',
  exchange_failed: 'Token exchange failed — check KITE_API_KEY / KITE_API_SECRET on the server.',
  not_configured: 'Kite Connect is not configured on the server yet.',
};

/**
 * Consume the OAuth handoff fragment exactly once, at module load, before
 * React (and StrictMode's double-rendering) get involved. The fragment never
 * reaches any server; it's stripped from the URL immediately so it doesn't
 * linger in the address bar or history entry.
 */
const initialHandoff = (() => {
  if (typeof window === 'undefined') return { token: null as string | null, error: null as string | null };
  const m = /^#kite_(token|error)=(.*)$/.exec(window.location.hash);
  if (!m) return { token: null, error: null };
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  const value = decodeURIComponent(m[2]);
  return m[1] === 'token' ? { token: value, error: null } : { token: null, error: ERROR_COPY[value] ?? value };
})();

const KiteContext = createContext<KiteContextValue | null>(null);

/**
 * Holds the Kite Connect session. The daily access token lives in local
 * storage per-user (the backend stays stateless; the API secret never leaves
 * the server). Tokens expire every morning — expiry flips status to
 * 'expired' so the UI can prompt a reconnect instead of silently breaking.
 */
export function KiteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<KiteStatus>('disconnected');
  const [loginError, setLoginError] = useState<string | null>(initialHandoff.error);
  // A token can arrive from the redirect before auth resolves — hold it here
  // until we know which user to file it under.
  const pendingTokenRef = useRef<string | null>(initialHandoff.token);

  useEffect(() => {
    if (!uid) {
      setToken(null);
      setStatus('disconnected');
      return;
    }
    const pending = pendingTokenRef.current;
    if (pending) {
      pendingTokenRef.current = null;
      try {
        localStorage.setItem(storageKey(uid), pending);
      } catch {
        /* private mode */
      }
      setToken(pending);
      setStatus('connected');
      setLoginError(null);
      return;
    }
    // Optimistically 'connected' when a token exists; the first data call
    // flips to 'expired' if it died overnight.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey(uid));
    } catch {
      /* private mode */
    }
    setToken(saved);
    setStatus(saved ? 'connected' : 'disconnected');
  }, [uid]);

  const connect = useCallback(() => {
    window.location.assign('/api/kite/login');
  }, []);

  const disconnect = useCallback(() => {
    if (uid) {
      try {
        localStorage.removeItem(storageKey(uid));
      } catch {
        /* private mode */
      }
    }
    setToken(null);
    setStatus('disconnected');
    setLoginError(null);
  }, [uid]);

  const markExpired = useCallback(() => setStatus('expired'), []);

  const setTokenManually = useCallback(
    (t: string) => {
      const trimmed = t.trim();
      if (!trimmed || !uid) return;
      try {
        localStorage.setItem(storageKey(uid), trimmed);
      } catch {
        /* private mode */
      }
      setToken(trimmed);
      setStatus('connected');
      setLoginError(null);
    },
    [uid],
  );

  const value = useMemo<KiteContextValue>(
    () => ({ status, connected: status === 'connected', token, loginError, connect, disconnect, markExpired, setTokenManually }),
    [status, token, loginError, connect, disconnect, markExpired, setTokenManually],
  );

  return <KiteContext.Provider value={value}>{children}</KiteContext.Provider>;
}

export function useKite(): KiteContextValue {
  const ctx = useContext(KiteContext);
  if (!ctx) throw new Error('useKite must be used within a <KiteProvider>');
  return ctx;
}
