import { useCallback, useMemo, useRef, useState } from 'react';
import type { ContextProvider, JarvisTool } from '../types';

export interface ToolRegistry {
  registerTools: (key: string, tools: JarvisTool[]) => () => void;
  registerContext: (key: string, provider: ContextProvider) => () => void;
  getTools: () => JarvisTool[];
  buildContext: () => Record<string, unknown>;
  capabilities: { module: string; name: string; description: string }[];
}

/**
 * Central registry for tools and context contributors. Modules register on
 * mount and unregister on unmount, so tool discovery is fully dynamic — the
 * engine never hardcodes what's available.
 */
export function useToolRegistry(): ToolRegistry {
  const toolsRef = useRef<Map<string, JarvisTool[]>>(new Map());
  const contextRef = useRef<Map<string, ContextProvider>>(new Map());
  const [version, setVersion] = useState(0);

  const registerTools = useCallback((key: string, tools: JarvisTool[]) => {
    toolsRef.current.set(key, tools);
    setVersion((v) => v + 1);
    return () => {
      toolsRef.current.delete(key);
      setVersion((v) => v + 1);
    };
  }, []);

  const registerContext = useCallback((key: string, provider: ContextProvider) => {
    contextRef.current.set(key, provider);
    return () => {
      contextRef.current.delete(key);
    };
  }, []);

  const getTools = useCallback(() => [...toolsRef.current.values()].flat(), []);

  const buildContext = useCallback(() => {
    const merged: Record<string, unknown> = {};
    for (const provider of contextRef.current.values()) {
      try {
        Object.assign(merged, provider());
      } catch {
        /* a broken provider must never break the whole context */
      }
    }
    return merged;
  }, []);

  const capabilities = useMemo(
    () => getTools().map((t) => ({ module: t.module, name: t.name, description: t.description })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return { registerTools, registerContext, getTools, buildContext, capabilities };
}
