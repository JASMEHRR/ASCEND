import type { OSState, JournalEntry } from '../../types';
import type { ObsidianClient } from '../obsidian/obsidianClient';

/** Keep only the newest N entries in Firestore; the vault holds the archive. */
const MAX_CACHED_ENTRIES = 50;

const two = (n: number) => String(n).padStart(2, '0');

export function vaultPathForToday(): string {
  const d = new Date();
  return `Journal/${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.md`;
}

/**
 * Write a journal entry everywhere it belongs: always into the capped OSState
 * cache (works offline), and into the user's Obsidian vault when connected.
 * Returns whether the vault write landed.
 */
export async function appendJournalEntry(
  updateState: (updater: (prev: OSState) => OSState) => void,
  obsidian: ObsidianClient | null,
  text: string,
  mode: 'text' | 'voice',
): Promise<{ inVault: boolean }> {
  let inVault = false;
  if (obsidian) {
    try {
      const now = new Date();
      await obsidian.appendNote(vaultPathForToday(), `- **${two(now.getHours())}:${two(now.getMinutes())}** _(${mode})_ ${text}`);
      inVault = true;
    } catch {
      inVault = false; // vault offline — the local cache still has it
    }
  }

  const entry: JournalEntry = { id: crypto.randomUUID(), text, at: new Date().toISOString(), mode, inVault };
  updateState((p) => ({
    ...p,
    journal: { entries: [entry, ...(p.journal?.entries ?? [])].slice(0, MAX_CACHED_ENTRIES) },
  }));
  return { inVault };
}
