/**
 * Shared auth + rate-limit middleware for every AI / paid-API route.
 *
 * Firebase ID tokens are verified with firebase-admin (lazy dynamic import so
 * the serverless bundle stays lean — see server.ts header). Token *signature*
 * verification works with a project-id-only init against Google's public certs;
 * Firestore access for rate limiting needs real credentials (service account /
 * ADC) and is skipped gracefully when they're absent.
 *
 * Rate limiting is Firestore-backed (a windowed counter at `rateLimits/{uid}`)
 * so the limit survives across stateless Vercel invocations. If Firestore is
 * unreachable (no admin credentials, transient error) it falls back to a
 * per-instance in-memory limiter — best-effort only, NOT production-grade
 * protection across instances. The auth gate, not the rate limiter, is the
 * real access control.
 */
import type { Request, Response, NextFunction } from 'express';
import { GeminiError } from './llm';

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'ascend-57d4e';

type AdminAuth = import('firebase-admin/auth').Auth;
type AdminFirestore = import('firebase-admin/firestore').Firestore;

let adminPromise: Promise<{ auth: AdminAuth; db: AdminFirestore | null }> | null = null;

async function getAdmin() {
  if (!adminPromise) {
    adminPromise = (async () => {
      const { getApps, initializeApp, applicationDefault, cert } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      let hasCredentials = false;
      if (!getApps().length) {
        const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (svc) {
          initializeApp({ credential: cert(JSON.parse(svc)), projectId: FIREBASE_PROJECT_ID });
          hasCredentials = true;
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
          hasCredentials = true;
        } else {
          // No service account: token signatures still verify against Google's
          // public certs, but Firestore (rate limiting) is unavailable.
          initializeApp({ projectId: FIREBASE_PROJECT_ID });
        }
      } else {
        hasCredentials = Boolean(
          process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS,
        );
      }
      let db: AdminFirestore | null = null;
      if (hasCredentials) {
        try {
          const { getFirestore } = await import('firebase-admin/firestore');
          db = getFirestore();
        } catch {
          db = null;
        }
      }
      return { auth: getAuth(), db };
    })();
  }
  return adminPromise;
}

/** Verify the Bearer token on a request; resolves to the uid or throws GeminiError(401). */
export async function verifyBearer(req: Request): Promise<string> {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new GeminiError(401, 'Missing or malformed Authorization header.');
  try {
    const { auth } = await getAdmin();
    const decoded = await auth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(401, 'Invalid or expired auth token.');
  }
}

// --- Rate limiting ----------------------------------------------------------
const WINDOW_MS = 60_000;

// Per-instance fallback (used only when Firestore is unavailable).
// ponytail: in-memory Map, correct for a single instance; Firestore path above
// is the cross-instance answer when admin credentials are configured.
const memoryHits = new Map<string, number[]>();
function memoryAllow(uid: string, limit: number): boolean {
  const now = Date.now();
  const hits = (memoryHits.get(uid) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    memoryHits.set(uid, hits);
    return false;
  }
  hits.push(now);
  memoryHits.set(uid, hits);
  return true;
}

/**
 * Returns false when the uid has exceeded `limit` requests in the current
 * window. Firestore-backed when credentials allow; otherwise in-memory.
 * Fails OPEN on transient Firestore errors — the auth gate is the real guard
 * and an infra hiccup shouldn't brick every AI feature.
 */
export async function checkRateLimit(uid: string, limit: number): Promise<boolean> {
  const { db } = await getAdmin();
  if (!db) return memoryAllow(uid, limit);

  const ref = db.collection('rateLimits').doc(uid);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.exists ? (snap.data() as { windowStart?: number; count?: number }) : null;
      if (!data || typeof data.windowStart !== 'number' || now - data.windowStart > WINDOW_MS) {
        tx.set(ref, { windowStart: now, count: 1 });
        return true;
      }
      if ((data.count ?? 0) >= limit) return false;
      tx.update(ref, { count: (data.count ?? 0) + 1 });
      return true;
    });
  } catch (err) {
    console.error('[rate-limit] Firestore error — falling back to in-memory for this uid', err);
    return memoryAllow(uid, limit);
  }
}

/**
 * Express middleware: require a valid Firebase ID token and enforce a per-uid
 * rate limit. Attaches the verified uid to `req.uid`. 401 on missing/invalid
 * token, 429 when over the limit.
 */
export function requireAuth(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 20;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = await verifyBearer(req);
      (req as Request & { uid?: string }).uid = uid;
      if (!(await checkRateLimit(uid, limit))) {
        res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
        return;
      }
      next();
    } catch (err) {
      const status = err instanceof GeminiError ? err.status : 401;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Unauthorized.' });
    }
  };
}
