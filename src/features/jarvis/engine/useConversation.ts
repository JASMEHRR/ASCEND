import { useCallback, useRef, useState } from 'react';
import { callJarvis } from './jarvisClient';
import type { ActionRecord, JarvisMessage, JarvisResponse, JarvisTool, StatusLine, ToolDeclaration, ToolResult } from '../types';

/** Below this self-reported confidence, a tool call is not executed. */
const CONFIDENCE_THRESHOLD = 0.45;

/**
 * The transcript sent to the model: role + clean content only. UI-only status
 * chips (✓/⚠) must never leak into multi-turn context.
 */
const toModelHistory = (msgs: JarvisMessage[]): JarvisMessage[] =>
  msgs.map(({ role, content }) => ({ role, content }));

/** What TTS reads: the model's short spoken line, or the reply if it's short. */
function spokenOf(plan: Pick<JarvisResponse, 'reply' | 'speak'>): string {
  if (plan.speak) return plan.speak;
  if (plan.reply.length <= 320) return plan.reply;
  // Long reply without a spoken version: read the first couple of sentences.
  const sentences = plan.reply.replace(/[#*`|]/g, '').split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ');
}

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
  /** Proactively push (and speak) an assistant line without an LLM round-trip. */
  greet: (text: string) => void;
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

  const greet = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      // Proactive greeting is text-only — it must never auto-speak (see voiceMode).
      push({ role: 'assistant', content: text });
    },
    [],
  );

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || thinkingRef.current) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const uiHistory = [...messagesRef.current, { role: 'user', content: text } as JarvisMessage];
      setMessages(uiHistory);
      const history = toModelHistory(uiHistory);
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
          deps.speak(spokenOf(plan));
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
        let spoken = spokenOf(plan);
        const wantsSummary =
          executed.some((e) => e.tool.followUp && e.result.ok) || executed.filter((e) => e.result.ok).length > 1;

        if (wantsSummary) {
          const note = executed
            .map((e) => `${e.tool.name} → ${e.result.ok ? 'ok' : 'failed'}: ${e.result.message}${e.result.data !== undefined ? ` | data: ${JSON.stringify(e.result.data)}` : ''}`)
            .join('\n');
          const followHistory: JarvisMessage[] = [
            ...history,
            { role: 'assistant', content: reply },
            { role: 'user', content: `[TOOL RESULTS]\n${note}\n\nReport the outcome to the user (answer their question with the data if they asked one).` },
          ];
          try {
            const summary = await callJarvis(followHistory, context, decls, ctrl.signal);
            if (summary.reply) {
              reply = summary.reply;
              spoken = spokenOf(summary);
            }
          } catch {
            /* keep the initial reply if the summary call fails */
          }
        }

        const status: StatusLine[] = [
          ...executed.filter((e) => e.result.ok).map((e): StatusLine => ({ kind: 'ok', text: e.result.message })),
          ...executed.filter((e) => !e.result.ok).map((e): StatusLine => ({ kind: 'warn', text: e.result.message })),
          ...skipped.map((s): StatusLine => ({ kind: 'info', text: s })),
        ];

        push({ role: 'assistant', content: reply, status });
        deps.speak(spoken);
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

  return { messages, thinking, sendMessage, greet, abort };
}
