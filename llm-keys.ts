/**
 * The key pool "llm.ts" draws from — Firestore-backed so a key can be added,
 * removed, or swapped from the Settings UI with no redeploy, and so more than
 * one free-tier key can back the same provider with automatic failover.
 *
 * Single-user app, same as the Telegram bridge: the pool lives under
 * ASCEND_UID's own tree (users/{uid}/llmKeys), already owner-only under
 * firestore.rules' blanket users/{userId}/** rule — no rules change needed.
 *
 * A key that fails with a quota/rate-limit shape gets a cooldown timestamp
 * instead of being removed, so it comes back on its own once the limit
 * resets rather than needing the user to notice and re-add it.
 */
import { getAdminDb } from './admin-db';

export type LlmProvider = 'groq' | 'nvidia' | 'gemini' | 'custom';

export interface LlmKey {
  id: string;
  provider: LlmProvider;
  label: string;
  key: string;
  /** custom provider only — an OpenAI-compatible chat/completions URL. */
  baseUrl?: string;
  /** custom provider only — the model id that endpoint expects. */
  model?: string;
  disabledUntil?: string | null;
  lastError?: string | null;
  addedAt: string;
  /** Result of the Settings UI's "Test" action — a key that has never
   *  passed a real completion is skipped here even if not on cooldown. */
  testOk?: boolean | null;
}

const POOL_TTL_MS = 20_000;
let cache: { at: number; keys: LlmKey[] } | null = null;

async function loadPool(): Promise<LlmKey[]> {
  const uid = process.env.ASCEND_UID;
  if (!uid) return [];
  const db = await getAdminDb();
  if (!db) return [];
  try {
    const snap = await db.collection(`users/${uid}/llmKeys`).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LlmKey);
  } catch (err) {
    console.warn('[llm-keys] pool read failed:', (err as Error).message);
    return [];
  }
}

/** Active (not cooling down) keys for one provider, cached briefly — this is
 *  called on every generateChat, so a Firestore read per message would be
 *  wasteful; 20s staleness is a fine trade for that. */
export async function activeKeysFor(provider: LlmProvider): Promise<LlmKey[]> {
  if (!cache || Date.now() - cache.at > POOL_TTL_MS) {
    cache = { at: Date.now(), keys: await loadPool() };
  }
  const now = Date.now();
  return cache.keys.filter(
    (k) =>
      k.provider === provider &&
      k.testOk !== false &&
      !(k.disabledUntil && Date.parse(k.disabledUntil) > now),
  );
}

/** Put a key on cooldown after a quota/rate-limit-shaped failure. Fire-and-
 *  forget from the caller's perspective — a failed cooldown write just means
 *  the same key gets retried next call, not a request-failing condition. */
export async function coolDownKey(id: string, reason: string, minutes: number): Promise<void> {
  const uid = process.env.ASCEND_UID;
  if (!uid) return;
  const db = await getAdminDb();
  if (!db) return;
  try {
    await db.doc(`users/${uid}/llmKeys/${id}`).update({
      disabledUntil: new Date(Date.now() + minutes * 60_000).toISOString(),
      lastError: reason.slice(0, 300),
    });
    // Reflect the cooldown in the in-memory cache immediately, so the very
    // next key-selection in this same request doesn't retry the same key
    // it just failed on before the next Firestore read would pick it up.
    if (cache) {
      const hit = cache.keys.find((k) => k.id === id);
      if (hit) hit.disabledUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    }
  } catch (err) {
    console.warn('[llm-keys] cooldown write failed:', (err as Error).message);
  }
}
