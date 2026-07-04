import { useCallback, useRef, useState } from 'react';
import { callJarvis } from './jarvisClient';
import type { ActionRecord, JarvisMessage, JarvisTool, ToolDeclaration, ToolResult } from '../types';

/** Below this self-reported confidence, a tool call is not executed. */
const CONFIDENCE_THRESHOLD = 0.45;

const GREETING: JarvisMessage = {
  role: 'assistant',
  content:
    "JARVIS online. I can see your day, your pipeline, and every module — ask how you're doing, or give me something to run. Try “plan my day” or “log 2 glasses of water and add a task to call the bank.”",
};

interface ConversationDeps {
  getTools: () => JarvisTool[];
  buildContext: () => Record<string, unknown>;
  recordAction: (a: ActionRecord) => void;
  speak: (text: string) => void;
}

export interface Conversation {
  messages: JarvisMessage[];
  thinking: boolean;
  sendMessage: (text: string) => void;
  abort: () => void;
}

/**
 * Drives a turn: plan (one LLM call that can propose several tool calls with
 * confidences) → validate + execute each above threshold → optionally summarize
 * the outcome. The LLM call retries once; tool side-effects never auto-retry
 * (idempotency). Failures degrade gracefully and are reported, not thrown away.
 */
export function useConversation(deps: ConversationDeps): Conversation {
  const [messages, setMessages] = useState<JarvisMessage[]>([GREETING]);
  const [thinking, setThinking] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const thinkingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const push = (msg: JarvisMessage) => setMessages((prev) => [...prev, msg]);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || thinkingRef.current) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const history = [...messagesRef.current, { role: 'user', content: text } as JarvisMessage];
      setMessages(history);
      thinkingRef.current = true;
      setThinking(true);

      const tools = deps.getTools();
      const context = deps.buildContext();
      const decls: ToolDeclaration[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        module: t.module,
        parameters: t.parameters,
      }));

      try {
        const plan = await callJarvis(history, context, decls, ctrl.signal);

        if (plan.needsClarification || plan.toolCalls.length === 0) {
          push({ role: 'assistant', content: plan.reply });
          deps.speak(plan.reply);
          return;
        }

        const executed: { tool: JarvisTool; result: ToolResult }[] = [];
        const skipped: string[] = [];

        for (const call of plan.toolCalls) {
          const tool = tools.find((t) => t.name === call.tool);
          if (!tool) {
            skipped.push(`unknown tool "${call.tool}"`);
            continue;
          }
          if (call.confidence < CONFIDENCE_THRESHOLD) {
            skipped.push(`held back ${tool.name} (low confidence)`);
            continue;
          }
          const invalid = tool.validate?.(call.args);
          if (invalid) {
            executed.push({ tool, result: { ok: false, message: `${tool.name}: ${invalid}` } });
            continue;
          }
          try {
            const result = await tool.execute(call.args);
            executed.push({ tool, result });
            deps.recordAction({
              tool: tool.name,
              module: tool.module,
              summary: result.message,
              ok: result.ok,
              at: new Date().toISOString(),
            });
          } catch (e) {
            executed.push({ tool, result: { ok: false, message: `${tool.name} failed: ${(e as Error).message}` } });
          }
        }

        let reply = plan.reply;
        const wantsSummary =
          executed.some((e) => e.tool.followUp && e.result.ok) || executed.filter((e) => e.result.ok).length > 1;

        if (wantsSummary) {
          const note = executed
            .map((e) => `${e.tool.name} → ${e.result.ok ? 'ok' : 'failed'}: ${e.result.message}${e.result.data !== undefined ? ` | data: ${JSON.stringify(e.result.data)}` : ''}`)
            .join('\n');
          const followHistory: JarvisMessage[] = [
            ...history,
            { role: 'assistant', content: reply },
            { role: 'user', content: `[TOOL RESULTS]\n${note}\n\nReport what you did (and why, briefly) in one or two spoken sentences.` },
          ];
          try {
            const summary = await callJarvis(followHistory, context, decls, ctrl.signal);
            if (summary.reply) reply = summary.reply;
          } catch {
            /* keep the initial reply if the summary call fails */
          }
        }

        const ok = executed.filter((e) => e.result.ok).map((e) => e.result.message);
        const bad = executed.filter((e) => !e.result.ok).map((e) => e.result.message);
        const suffix = [
          ok.length ? `\n\n✓ ${ok.join(' · ')}` : '',
          bad.length ? `\n\n⚠ ${bad.join(' · ')}` : '',
          skipped.length ? `\n\n· ${skipped.join(' · ')}` : '',
        ].join('');

        push({ role: 'assistant', content: `${reply}${suffix}` });
        deps.speak(reply);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        push({ role: 'assistant', content: `Connection issue: ${(e as Error).message}. Try again, sir.` });
      } finally {
        thinkingRef.current = false;
        setThinking(false);
      }
    },
    // deps are all stable callbacks from their hooks
    [deps],
  );

  return { messages, thinking, sendMessage, abort };
}
