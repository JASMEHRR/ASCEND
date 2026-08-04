import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useToolRegistry, type ToolRegistry } from './useToolRegistry';
import { useConversation, type Conversation } from './useConversation';
import { useJarvisMemory, type JarvisMemory } from '../memory/useJarvisMemory';
import { useVoice } from '../voice/useVoice';

interface JarvisContextValue extends Conversation {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  registerTools: ToolRegistry['registerTools'];
  registerContext: ToolRegistry['registerContext'];
  capabilities: ToolRegistry['capabilities'];
  memory: JarvisMemory;
  voice: ReturnType<typeof useVoice>;
}

const JarvisContext = createContext<JarvisContextValue | null>(null);

/**
 * The Jarvis engine: composes the tool registry, layered memory, voice, and the
 * conversation loop into one context. Knows nothing ASCEND-specific — modules
 * wire themselves in via registerTools / registerContext (see CoreRegistrar).
 */
export function JarvisProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const registry = useToolRegistry();
  const memory = useJarvisMemory(user?.uid ?? null);

  // A name for the backend to actually address the user by, instead of the
  // hardcoded "sir" that used to stand in for everyone. Prefers a real display
  // name; falls back to the email's local part; omitted entirely if neither
  // exists, so Jarvis just doesn't use an honorific rather than guessing one.
  const userName = user?.displayName?.trim() || user?.email?.split('@')[0] || undefined;

  // Context always carries layered memory (facts + recent actions).
  const buildContext = useMemo(
    () => () => ({ ...registry.buildContext(), memory: memory.snapshot(), user: userName }),
    [registry.buildContext, memory.snapshot, userName],
  );

  // Voice's onResult must call the latest sendMessage — routed through a ref.
  const sendRef = useRef<(t: string) => void>(() => {});
  const voice = useVoice({ onResult: (t) => sendRef.current(t) });

  const convoDeps = useMemo(
    () => ({ getTools: registry.getTools, buildContext, recordAction: memory.recordAction, speak: voice.speak }),
    [registry.getTools, buildContext, memory.recordAction, voice.speak],
  );
  const conversation = useConversation(convoDeps);
  sendRef.current = conversation.sendMessage;

  const value = useMemo<JarvisContextValue>(
    () => ({
      ...conversation,
      open,
      setOpen,
      toggle: () => setOpen((o) => !o),
      registerTools: registry.registerTools,
      registerContext: registry.registerContext,
      capabilities: registry.capabilities,
      memory,
      voice,
    }),
    [conversation, open, registry.registerTools, registry.registerContext, registry.capabilities, memory, voice],
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis(): JarvisContextValue {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error('useJarvis must be used within a <JarvisProvider>');
  return ctx;
}
