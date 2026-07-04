import { useEffect } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import { useObsidian } from './ObsidianContext';
import { createObsidianTools } from './obsidianTools';

/**
 * Registers the Obsidian tools with Jarvis while connected, and unregisters them
 * cleanly on disconnect. Renders nothing. This is the whole "enable/disable"
 * seam — no other module knows Obsidian exists.
 */
export default function ObsidianRegistrar() {
  const { registerTools, registerContext } = useJarvis();
  const { client, connected } = useObsidian();

  useEffect(() => {
    if (!connected || !client) return;
    const unregTools = registerTools('obsidian', createObsidianTools(client));
    const unregCtx = registerContext('obsidian', () => ({
      obsidian: {
        connected: true,
        note:
          "The user's personal Obsidian vault is your long-term memory. Search it (searchNotes) before saying you don't know something about the user's notes, journals, or past decisions. When the user shares a lasting fact, preference, or decision, persist it with saveMemory. Read-back is silent — never dump raw notes unless asked.",
        memoryNote: 'Jarvis/Memory.md',
      },
    }));
    return () => {
      unregTools();
      unregCtx();
    };
  }, [connected, client, registerTools, registerContext]);

  return null;
}
