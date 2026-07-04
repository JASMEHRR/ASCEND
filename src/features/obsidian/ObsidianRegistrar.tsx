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
    const unregCtx = registerContext('obsidian', () => ({ obsidian: { connected: true } }));
    return () => {
      unregTools();
      unregCtx();
    };
  }, [connected, client, registerTools, registerContext]);

  return null;
}
