/**
 * Firebase Admin SDK access for server routes that need to read a user's data
 * with no browser/Electron session involved at all — currently only the
 * Telegram webhook (telegram-routes.ts), which has no client to fetch from.
 *
 * Same setup and same graceful-degradation shape as server-log.ts's own admin
 * init (kept separate rather than shared: that one is add-only and narrow by
 * design; this one needs real reads). Requires FIREBASE_SERVICE_ACCOUNT —
 * unset means every caller here gets null and must degrade, never throw.
 */

interface AdminFirestoreLike {
  collection: (path: string) => {
    get: () => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>;
    add: (data: Record<string, unknown>) => Promise<{ id: string }>;
  };
  doc: (path: string) => {
    get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
    set: (data: Record<string, unknown>) => Promise<unknown>;
  };
}

let dbPromise: Promise<AdminFirestoreLike | null> | null = null;

async function initAdminDb(): Promise<AdminFirestoreLike | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Non-literal specifiers — same reasoning as server-log.ts: the optional
    // dependency shouldn't be required at compile time for routes that never
    // touch this file.
    const appPkg = 'firebase-admin/app';
    const firestorePkg = 'firebase-admin/firestore';
    const { getApps, initializeApp, cert } = (await import(appPkg)) as {
      getApps: () => unknown[];
      initializeApp: (opts: Record<string, unknown>) => unknown;
      cert: (v: Record<string, unknown>) => unknown;
    };
    const { getFirestore } = (await import(firestorePkg)) as {
      getFirestore: () => AdminFirestoreLike;
    };
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    return getFirestore();
  } catch (err) {
    console.warn('[admin-db] init failed:', (err as Error).message);
    return null;
  }
}

/** Resolves to a Firestore instance, or null when unconfigured/unavailable. */
export function getAdminDb(): Promise<AdminFirestoreLike | null> {
  dbPromise ??= initAdminDb();
  return dbPromise;
}
