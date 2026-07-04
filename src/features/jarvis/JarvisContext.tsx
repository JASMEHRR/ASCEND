import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useVoice } from './useVoice';
import type { ContextProvider, JarvisMessage, JarvisTool, ToolDeclaration, ToolResult } from './types';

interface JarvisContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  messages: JarvisMessage[];
  thinking: boolean;
  sendMessage: (text: string) => void;
  /** Register a module's tools; returns an unregister fn. */
  registerTools: (key: string, tools: JarvisTool[]) => () => void;
  /** Register a module's live-context contributor; returns an unregister fn. */
  registerContext: (key: string, provider: ContextProvider) => () => void;
  capabilities: { module: string; name: string; description: string }[];
  voice: ReturnType<typeof useVoice>;
}

const JarvisContext = createContext<JarvisContextValue | null>(null);

const GREETING: JarvisMessage = {
  role: 'assistant',
  content: 'JARVIS online. Ask how your day is going, or tell me to log water, add a task, validate an idea — anything across the system.',
};

async function callJarvis(history: JarvisMessage[], context: Record<string, unknown>, tools: ToolDeclaration[]) {
  const res = await fetch('/api/jarvis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, context, tools }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Server error (${res.status})`);
  return data as { reply: string; toolCalls: { tool: string; args?: Record<string, unknown> }[] };
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<JarvisMessage[]>([GREETING]);
  const [thinking, setThinking] = useState(false);
  const [toolsVersion, setToolsVersion] = useState(0);

  const toolsRef = useRef<Map<string, JarvisTool[]>>(new Map());
  const contextRef = useRef<Map<string, ContextProvider>>(new Map());
  const messagesRef = useRef<JarvisMessage[]>(messages);
  messagesRef.current = messages;

  const registerTools = useCallback((key: string, tools: JarvisTool[]) => {
    toolsRef.current.set(key, tools);
    setToolsVersion((v) => v + 1);
    return () => {
      toolsRef.current.delete(key);
      setToolsVersion((v) => v + 1);
    };
  }, []);

  const registerContext = useCallback((key: string, provider: ContextProvider) => {
    contextRef.current.set(key, provider);
    return () => {
      contextRef.current.delete(key);
    };
  }, []);

  const allTools = useCallback((): JarvisTool[] => [...toolsRef.current.values()].flat(), []);

  const buildContext = useCallback((): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};
    for (const provider of contextRef.current.values()) {
      try {
        Object.assign(merged, provider());
      } catch {
        /* a broken context provider shouldn't break Jarvis */
      }
    }
    return merged;
  }, []);

  const voice = useVoice({ onResult: (t) => sendMessageRef.current(t) });
  const voiceSpeak = voice.speak;

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || thinking) return;

      const history = [...messagesRef.current, { role: 'user', content: text } as JarvisMessage];
      setMessages(history);
      setThinking(true);

      const tools = allTools();
      const context = buildContext();
      const declarations: ToolDeclaration[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        module: t.module,
        parameters: t.parameters,
      }));

      try {
        const first = await callJarvis(history, context, declarations);

        // Execute the requested tools through the registry.
        const executed: { tool: JarvisTool; result: ToolResult }[] = [];
        for (const call of first.toolCalls ?? []) {
          const tool = tools.find((t) => t.name === call.tool);
          if (!tool) continue;
          try {
            executed.push({ tool, result: await tool.execute(call.args ?? {}) });
          } catch (e) {
            executed.push({ tool, result: { ok: false, message: (e as Error).message } });
          }
        }

        let reply = first.reply;

        // If any executed tool wants a follow-up (reads/AI), summarize its result.
        if (executed.some((e) => e.tool.followUp && e.result.ok)) {
          const note = executed
            .map((e) => `${e.tool.name} → ${e.result.ok ? 'ok' : 'failed'}: ${e.result.message}${e.result.data !== undefined ? ` | data: ${JSON.stringify(e.result.data)}` : ''}`)
            .join('\n');
          const followHistory: JarvisMessage[] = [
            ...history,
            { role: 'assistant', content: reply },
            { role: 'user', content: `[TOOL RESULTS]\n${note}\n\nReport the outcome to me in one or two spoken sentences.` },
          ];
          try {
            const second = await callJarvis(followHistory, context, declarations);
            if (second.reply) reply = second.reply;
          } catch {
            /* keep the first reply if the follow-up fails */
          }
        }

        const chips = executed.filter((e) => e.result.ok).map((e) => e.result.message);
        const failures = executed.filter((e) => !e.result.ok).map((e) => e.result.message);
        const suffix = [
          chips.length ? `\n\n✓ ${chips.join(' · ')}` : '',
          failures.length ? `\n\n⚠ ${failures.join(' · ')}` : '',
        ].join('');

        setMessages((prev) => [...prev, { role: 'assistant', content: `${reply}${suffix}` }]);
        voiceSpeak(reply);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Connection issue: ${(e as Error).message}. Try again, sir.` },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [thinking, allTools, buildContext, voiceSpeak],
  );

  // Stable ref so the voice callback always calls the latest sendMessage.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  const capabilities = useMemo(
    () =>
      allTools().map((t) => ({ module: t.module, name: t.name, description: t.description })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolsVersion],
  );

  const value = useMemo<JarvisContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((o) => !o),
      messages,
      thinking,
      sendMessage,
      registerTools,
      registerContext,
      capabilities,
      voice,
    }),
    [open, messages, thinking, sendMessage, registerTools, registerContext, capabilities, voice],
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis(): JarvisContextValue {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error('useJarvis must be used within a <JarvisProvider>');
  return ctx;
}
