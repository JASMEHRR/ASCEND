/**
 * fetch() wrapper that attaches the current user's Firebase ID token as a
 * Bearer Authorization header. Every call to a gated /api route (see
 * server.ts / auth-mw.ts) must go through this so the request carries proof of
 * identity; unauthenticated calls get a clear error instead of a silent 401.
 */
import { auth } from './firebase';

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You must be signed in to do that.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
