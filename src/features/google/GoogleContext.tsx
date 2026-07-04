import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GOOGLE_CLIENT_ID, hasStoredToken, requestGoogleToken, revokeGoogleToken } from './googleAuth';

/**
 * Google connection state for the signed-in user. "Connected" is a per-uid
 * localStorage flag (the user linked their Google account once); the actual
 * access token is short-lived and re-acquired silently on demand.
 */
interface GoogleValue {
  /** Whether a VITE_GOOGLE_CLIENT_ID is configured at all. */
  configured: boolean;
  connected: boolean;
  connecting: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  /**
   * A valid access token, silently refreshed when possible. Returns null when
   * not connected / silent grant fails (caller should surface "reconnect").
   */
  getToken: () => Promise<string | null>;
}

const connectedKey = (uid: string) => `ascend_google_connected_${uid}`;

const GoogleContext = createContext<GoogleValue | null>(null);

export function GoogleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const email = user?.email ?? null;
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!uid) {
      setConnected(false);
      return;
    }
    try {
      setConnected(localStorage.getItem(connectedKey(uid)) === '1' || hasStoredToken(uid));
    } catch {
      setConnected(false);
    }
  }, [uid]);

  const connect = useCallback(async () => {
    if (!uid) return false;
    setConnecting(true);
    try {
      // Try silent first (re-connect on a new device is then one click, no popup).
      const token = (await requestGoogleToken(uid, email, false)) ?? (await requestGoogleToken(uid, email, true));
      const ok = !!token;
      if (ok) {
        try {
          localStorage.setItem(connectedKey(uid), '1');
        } catch {
          /* private mode */
        }
      }
      setConnected(ok);
      return ok;
    } finally {
      setConnecting(false);
    }
  }, [uid, email]);

  const disconnect = useCallback(async () => {
    if (!uid) return;
    await revokeGoogleToken(uid);
    try {
      localStorage.removeItem(connectedKey(uid));
    } catch {
      /* private mode */
    }
    setConnected(false);
  }, [uid]);

  const getToken = useCallback(async () => {
    if (!uid || !connected) return null;
    return requestGoogleToken(uid, email, false);
  }, [uid, email, connected]);

  const value = useMemo<GoogleValue>(
    () => ({ configured: !!GOOGLE_CLIENT_ID, connected, connecting, connect, disconnect, getToken }),
    [connected, connecting, connect, disconnect, getToken],
  );

  return <GoogleContext.Provider value={value}>{children}</GoogleContext.Provider>;
}

export function useGoogle(): GoogleValue {
  const ctx = useContext(GoogleContext);
  if (!ctx) throw new Error('useGoogle must be used within a <GoogleProvider>');
  return ctx;
}
