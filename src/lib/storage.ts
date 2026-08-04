/**
 * localStorage that cannot take the app down.
 *
 * Accessing `localStorage` *throws* — not returns null — when storage is
 * blocked: Safari private windows, Chrome with third-party data disabled, and
 * the in-app browsers inside WhatsApp, Instagram and similar. A throw inside a
 * `useState` initialiser happens during render, which unmounts the tree and
 * leaves a black page with nothing in the console to explain it.
 *
 * Every read and write in the app should go through here. Preferences quietly
 * stop persisting when storage is unavailable, which is the right trade: the
 * app still works, it just forgets your sidebar was collapsed.
 */

export function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked or full — preferences just don't persist */
  }
}

export function removeStore(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* as above */
  }
}

/** Read a JSON value, falling back when it's missing or unparseable. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readStore(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeStore(key, JSON.stringify(value));
  } catch {
    /* unserialisable — nothing worth crashing over */
  }
}
