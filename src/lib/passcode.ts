/**
 * SHA-256 passcode hashing for the privacy-locked vaults (Purchases, Stocks).
 *
 * This is a *local privacy lock* — it hides sensitive views from a shoulder-
 * surfer on a shared device, not a cryptographic secret store. Only the hash is
 * ever written to localStorage; the plaintext PIN never leaves the input.
 *
 * ponytail: a bare SHA-256 of a short PIN is brute-forceable offline (a few
 * thousand combos); acceptable for a shoulder-surf lock. If this ever needs to
 * resist a determined local attacker, swap in PBKDF2/Argon2 with many iterations.
 * The uid salt only de-duplicates hashes across users / blocks trivial rainbow
 * tables.
 */

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash a passcode for storage. Salted with the owner's uid. */
export function hashPasscode(code: string, uid: string): Promise<string> {
  return sha256Hex(`${uid}:${code}`);
}

/** Constant-ish comparison of a candidate passcode against a stored hash. */
export async function verifyPasscode(code: string, uid: string, storedHash: string): Promise<boolean> {
  const candidate = await hashPasscode(code, uid);
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0;
}
