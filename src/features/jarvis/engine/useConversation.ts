import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { callJarvis } from './jarvisClient';
import type { ActionRecord, JarvisMessage, JarvisResponse, JarvisTool, StatusLine, ToolDeclaration, ToolResult } from '../types';

/** Keep the persisted transcript from growing without bound. */
const MAX_STORED_MESSAGES = 200;

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
  /** Signed-in uid, for persisting the transcript. Null while signed out. */
  uid: string | null;
  /**
   * Whether a typed message should still get a spoken reply. Off by default:
   * a voice reply makes sense when you spoke to Jarvis, not when you typed to
   * it — a reply that suddenly talks back at you mid-typing session reads as
   * a bug, not a feature.
   */
  speakOnText: boolean;
}

export interface Conversation {
  messages: JarvisMessage[];
  thinking: boolean;
  /** `origin` distinguishes a typed message from a spoken one, for speakOnText. */
  sendMessage: (text: string, origin?: 'text' | 'voice') => void;
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
  const lastSyncedRef = useRef('');
  // 'unset' is distinct from both a real uid and null (signed out), so the
  // very first render always runs the load-transcript effect once.
  const loadedForUidRef = useRef<string | null | 'unset'>('unset');

  /**
   * Persist the transcript the same way Jarvis's memory already does:
   * localStorage first for instant reload, then a debounced Firestore write
   * per user so signing out and back in (or opening on another device) finds
   * the conversation still there instead of resetting to the greeting.
   */
  useEffect(() => {
    const uid = deps.uid;
    if (loadedForUidRef.current === uid) return;
    loadedForUidRef.current = uid;

    const cacheKey = `ascend_jarvis_chat_${uid ?? 'guest'}`;
    let seed: JarvisMessage[] = [GREETING];
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) seed = parsed;
      }
    } catch {
      /* ignore */
    }
    setMessages(seed);
    lastSyncedRef.current = '';
    if (!uid) return;

    const ref = doc(db, 'users', uid, 'jarvis', 'chat');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const stored = snap.data()?.messages;
        if (!Array.isArray(stored) || stored.length === 0) return;
        lastSyncedRef.current = JSON.stringify(stored);
        setMessages(stored);
      },
      (err) => console.warn('[jarvis chat] listener error:', err.message),
    );
  }, [deps.uid]);

  useEffect(() => {
    const uid = deps.uid;
    const cacheKey = `ascend_jarvis_chat_${uid ?? 'guest'}`;
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(trimmed));
    } catch {
      /* ignore (private window / storage full) */
    }
    if (!uid) return;
    const payload = JSON.stringify(trimmed);
    if (payload === lastSyncedRef.current) return;
    const t = setTimeout(async () => {
      lastSyncedRef.current = payload;
      try {
        await setDoc(doc(db, 'users', uid, 'jarvis', 'chat'), { messages: trimmed });
      } catch (err) {
        console.warn('[jarvis chat] write failed:', (err as Error).message);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [messages, deps.uid]);

  const push = (msg: JarvisMessage) => setMessages((prev) => [...prev, msg]);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  const greet = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      push({ role: 'assistant', content: text });
      deps.speak(text);
    },
    [deps],
  );

  const sendMessage = useCallback(
    async (raw: string, origin: 'text' | 'voice' = 'text') => {
      const text = raw.trim();
      if (!text || thinkingRef.current) return;
      // Voice always gets a spoken reply; typed only does if opted in.
      const shouldSpeak = origin === 'voice' || deps.speakOnText;
      const speak = (t: string) => shouldSpeak && deps.speak(t);

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
          speak(spokenOf(plan));
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
        speak(spoken);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        push({ role: 'assistant', content: `Connection issue: ${(e as Error).message}. Try again.` });
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
