/**
 * Server-side activity log.
 *
 * Writes structured entries to a Firestore collection that no browser client
 * can read or write: firestore.rules ends with a catch-all `allow read, write:
 * if false`, and only paths explicitly matched above it (users/{uid}, and
 * arenaRooms) are reachable from the client. The Admin SDK bypasses rules
 * entirely, so the server can append here while the frontend can't even see
 * that the collection exists. Logs are deliberately never surfaced in the UI.
 *
 * Setup (optional — everything below degrades safely without it):
 *   1. Firebase console → Project settings → Service accounts → Generate key.
 *   2. Paste the whole JSON into a Vercel env var named
 *      FIREBASE_SERVICE_ACCOUNT (Settings → Environment Variables).
 *
 * With that unset — local dev, or before you've configured it — this falls
 * back to structured console output, which still shows up in `vercel logs`.
 * Nothing throws and no request path changes either way, so a missing
 * credential can never take an API route down.
 *
 * Granting someone temporary access: add their Google account as a Viewer on
 * the Firebase project (IAM → Grant access), let them read the collection in
 * the console, then remove the grant. No code change, no shared key.
 */

const COLLECTION = '_logs';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  /** Coarse bucket, e.g. 'jarvis', 'kite', 'search'. */
  scope: string;
  message: string;
  /** Signed-in user the request belongs to, when the route knows it. */
  uid?: string;
  /** Any extra structured detail — kept small; never log secrets or tokens. */
  meta?: Record<string, unknown>;
}

/** Resolves to a Firestore instance, or null when unconfigured/unavailable. */
let dbPromise: Promise<FirestoreLike | null> | null = null;

/** The narrow slice of the Admin SDK surface used here. */
interface FirestoreLike {
  collection: (path: string) => {
    add: (data: Record<string, unknown>) => Promise<unknown>;
  };
}

async function getDb(): Promise<FirestoreLike | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Non-literal specifiers keep TypeScript from requiring firebase-admin at
    // compile time, so the project still builds (and every route still works)
    // on an install that doesn't have the optional dependency present.
    const appPkg = 'firebase-admin/app';
    const firestorePkg = 'firebase-admin/firestore';
    const { getApps, initializeApp, cert } = (await import(appPkg)) as {
      getApps: () => unknown[];
      initializeApp: (opts: Record<string, unknown>) => unknown;
      cert: (v: Record<string, unknown>) => unknown;
    };
    const { getFirestore } = (await import(firestorePkg)) as {
      getFirestore: () => FirestoreLike;
    };
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    return getFirestore();
  } catch (err) {
    console.warn('[server-log] admin init failed, falling back to console:', (err as Error).message);
    return null;
  }
}

/**
 * Append one entry. Never throws and never blocks the caller's response —
 * logging must not be able to fail a request.
 */
export function logEvent(entry: LogEntry): void {
  const line = `[${entry.scope}] ${entry.message}`;
  if (entry.level === 'error') console.error(line, entry.meta ?? '');
  else if (entry.level === 'warn') console.warn(line, entry.meta ?? '');
  else console.log(line, entry.meta ?? '');

  dbPromise ??= getDb();
  void dbPromise
    .then((db) => {
      if (!db) return;
      return db.collection(COLLECTION).add({
        ...entry,
        meta: entry.meta ?? {},
        at: new Date().toISOString(),
      });
    })
    .catch((err) => console.warn('[server-log] write failed:', (err as Error).message));
}
