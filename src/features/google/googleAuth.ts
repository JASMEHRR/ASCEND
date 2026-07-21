/**
 * Google Identity Services (GIS) token flow — fully client-side.
 *
 * Access tokens live in sessionStorage (per user), expire after ~1h, and are
 * silently re-requested when possible. No client secret, nothing server-side;
 * the client ID comes from VITE_GOOGLE_CLIENT_ID (see GOOGLE_SETUP.md).
 */

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
].join(' ');

export const GOOGLE_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface StoredToken {
  accessToken: string;
  /** Epoch ms after which the token is considered dead (with safety margin). */
  expiresAt: number;
  scopes: string;
}

const storageKey = (uid: string) => `ascend_google_token_${uid}`;

let gsiLoading: Promise<void> | null = null;

/** Load the GIS script once. */
function loadGsi(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoading) return gsiLoading;
  gsiLoading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = GSI_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      gsiLoading = null;
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(el);
  });
  return gsiLoading;
}

function readStored(uid: string): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    return t.accessToken && t.expiresAt > Date.now() ? t : null;
  } catch {
    return null;
  }
}

function writeStored(uid: string, token: StoredToken | null) {
  try {
    if (token) sessionStorage.setItem(storageKey(uid), JSON.stringify(token));
    else sessionStorage.removeItem(storageKey(uid));
  } catch {
    /* private mode */
  }
}

/**
 * Request an access token via GIS. `interactive: false` tries a silent grant
 * (works once the user has consented before); `interactive: true` opens the
 * consent popup — only call that from a user gesture.
 */
export async function requestGoogleToken(
  uid: string,
  email: string | null,
  interactive: boolean,
): Promise<string | null> {
  if (!GOOGLE_CLIENT_ID) return null;
  const cached = readStored(uid);
  if (cached) return cached.accessToken;

  await loadGsi();
  const oauth2 = (window as any).google.accounts.oauth2;

  return new Promise((resolve) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      include_granted_scopes: true,
      ...(email ? { hint: email } : {}),
      callback: (resp: { access_token?: string; expires_in?: number; scope?: string; error?: string }) => {
        if (resp.error || !resp.access_token) {
          resolve(null);
          return;
        }
        writeStored(uid, {
          accessToken: resp.access_token,
          // 60s safety margin before the reported expiry.
          expiresAt: Date.now() + (Number(resp.expires_in ?? 3600) - 60) * 1000,
          scopes: resp.scope ?? GOOGLE_SCOPES,
        });
        resolve(resp.access_token);
      },
      error_callback: () => resolve(null),
    });
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

/** Drop the cached token and revoke the grant. */
export async function revokeGoogleToken(uid: string): Promise<void> {
  const cached = readStored(uid);
  writeStored(uid, null);
  if (!cached) return;
  try {
    await loadGsi();
    (window as any).google.accounts.oauth2.revoke(cached.accessToken, () => {});
  } catch {
    /* best-effort */
  }
}

export function hasStoredToken(uid: string): boolean {
  return readStored(uid) !== null;
}
