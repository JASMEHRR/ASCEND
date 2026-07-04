import { useEffect, useRef } from 'react';
import type { OSState } from '../../types';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';
import { useObsidian } from '../obsidian/ObsidianContext';
import { appendJournalEntry } from './journal';

interface Deps {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

/** Jarvis tools + context for the Journaling module ("journal that …"). */
export default function JournalRegistrar({ state, updateState }: Deps) {
  const { registerTools, registerContext } = useJarvis();
  const obsidian = useObsidian();

  const stateRef = useRef(state);
  stateRef.current = state;
  const obsidianRef = useRef(obsidian);
  obsidianRef.current = obsidian;

  useEffect(() => {
    return registerContext('journal', () => {
      const entries = stateRef.current.journal?.entries ?? [];
      return {
        journal: {
          entryCount: entries.length,
          lastEntryAt: entries[0]?.at ?? null,
          vaultSync: obsidianRef.current.connected,
        },
      };
    });
  }, [registerContext]);

  useEffect(() => {
    const tools: JarvisTool[] = [
      {
        name: 'addJournalEntry',
        module: 'Journal',
        description: "Save a reflection/journal entry for the user (their words, not a summary). Syncs to their Obsidian vault when connected.",
        parameters: { text: 'the journal entry text' },
        validate: (a) => (String(a.text ?? '').trim() ? null : 'entry text is required'),
        execute: async (a) => {
          const o = obsidianRef.current;
          const { inVault } = await appendJournalEntry(updateState, o.connected ? o.client : null, String(a.text).trim(), 'text');
          return { ok: true, message: inVault ? 'journal entry saved (synced to vault)' : 'journal entry saved locally' };
        },
      },
      {
        name: 'readRecentJournal',
        module: 'Journal',
        description: 'Read the most recent journal entries to reflect back on them with the user.',
        parameters: { count: 'how many entries (default 5, max 15)' },
        followUp: true,
        execute: (a) => {
          const n = Math.min(Math.max(Math.round(Number(a.count) || 5), 1), 15);
          const entries = (stateRef.current.journal?.entries ?? []).slice(0, n);
          return {
            ok: true,
            message: `read ${entries.length} journal entr${entries.length === 1 ? 'y' : 'ies'}`,
            data: entries.map((e) => ({ at: e.at, text: e.text })),
          };
        },
      },
    ];
    return registerTools('journal', tools);
  }, [registerTools, updateState]);

  return null;
}
