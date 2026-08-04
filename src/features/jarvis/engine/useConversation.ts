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
 * After this much idle time, the *visible* thread resets to a clean slate on
 * the next message — the old exchange archives into chatHistory instead of
 * sitting there forever. Jarvis's own memory/context is untouched either way;
 * this only tidies up what's shown on screen.
 */
const IDLE_RESET_MS = 5 * 60 * 1000;

/** Cap on how many past sessions the Log panel keeps around. */
const MAX_CHAT_HISTORY = 30;

export interface ChatSession {
  id: string;
  endedAt: string;
  messages: JarvisMessage[];
}

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
  /** Past visible sessions, archived on idle-reset. Newest first. */
  chatHistory: ChatSession[];
}

/**
 * Drives a turn: plan (one LLM call that can propose several tool calls with
 * confidences) → validate + execute each above threshold → optionally summarize
 * the outcome. The LLM call retries once; tool side-effects never auto-retry
 * (idempotency). Failures degrade gracefully and are reported, not thrown away.
 */
export function useConversation(deps: ConversationDeps): Conversation {
  const [messages, setMessages] = useState<JarvisMessage[]>([GREETING]);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [thinking, setThinking] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const thinkingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSyncedRef = useRef('');
  // Timestamp of the last message (either side). Used to detect a >5min gap
  // and archive the visible thread before starting the next one fresh.
  const lastActivityRef = useRef(Date.now());
  /**
   * The durable conversation Jarvis actually reasons over — kept separate
   * from the `messages` UI state so an idle-reset can clear what's rendered
   * on screen without Jarvis losing context of what was discussed. Reset only
   * on sign-in/out (see the load effect below), never on idle.
   */
  const modelHistoryRef = useRef<JarvisMessage[]>([]);
  // 'unset' is distinct from both a real uid and null (signed out), so the
  // very first render always runs the load-transcript effect once.
  const loadedForUidRef = useRef<string | null | 'unset'>('unset');
  /**
   * Guards the write-effect against firing before Firestore's *first* snapshot
   * for the current uid has actually arrived.
   *
   * Without this: on sign-in, `uid` flips to a real value one render before
   * the async onSnapshot callback delivers the saved transcript. `messages`
   * is still the stale (often just-the-greeting) local state at that moment,
   * and the write-effect — which also depends on `deps.uid` — fires in that
   * same pass and schedules an 800ms write of the stale value. Normally the
   * follow-up render (once the snapshot lands) cancels that timer before it
   * fires. But on a slow connection the round-trip can take longer than
   * 800ms, so the stale write lands first and clobbers the real history —
   * this was the actual cause of chat "vanishing" on relogin.
   */
  const readyForUidRef = useRef<string | null>(null);
  // Mirrors readyForUidRef but as state, purely so the write-effect re-runs
  // once readiness flips even when there's no stored data to load (a brand
  // new account) — a ref flip alone doesn't trigger a re-render.
  const [, forceRecheck] = useState(0);

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
    readyForUidRef.current = null;

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
    modelHistoryRef.current = seed;
    lastActivityRef.current = Date.now();
    lastSyncedRef.current = '';
    if (!uid) {
      // No account to wait on — the local cache IS the source of truth.
      readyForUidRef.current = uid;
      return;
    }

    const ref = doc(db, 'users', uid, 'jarvis', 'chat');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const stored = snap.data()?.messages;
        // Even an empty/missing doc counts as "checked" — a genuinely new
        // account has nothing to load, and that's fine; it just shouldn't be
        // confused with "haven't heard back yet". forceRecheck re-renders so
        // the write-effect notices even when there's no data to setMessages.
        readyForUidRef.current = uid;
        forceRecheck((n) => n + 1);
        if (!Array.isArray(stored) || stored.length === 0) return;
        lastSyncedRef.current = JSON.stringify(stored);
        setMessages(stored);
        modelHistoryRef.current = stored;
      },
      (err) => {
        console.warn('[jarvis chat] listener error:', err.message);
        readyForUidRef.current = uid; // don't block writes forever on a denied/broken read
        forceRecheck((n) => n + 1);
      },
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
    // Firestore's own first read for this uid hasn't come back yet — writing
    // now risks overwriting real history with this render's stale/seed value.
    if (readyForUidRef.current !== uid) return;
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

  const push = (msg: JarvisMessage) => {
    setMessages((prev) => [...prev, msg]);
    modelHistoryRef.current = [...modelHistoryRef.current, msg];
  };

  const abort = useCallback(() => abortRef.current?.abort(), []);

  /**
   * Called at the start of every new turn. If the visible thread has been
   * quiet for IDLE_RESET_MS, archive what's currently on screen into
   * chatHistory and clear it back to just the greeting. modelHistoryRef is
   * deliberately left alone — Jarvis keeps reasoning with full context even
   * though the screen looks fresh.
   */
  const archiveIfIdle = () => {
    const now = Date.now();
    const idleFor = now - lastActivityRef.current;
    lastActivityRef.current = now;
    if (idleFor < IDLE_RESET_MS) return;
    const current = messagesRef.current;
    // Nothing beyond the greeting to archive — skip the no-op session.
    if (current.length <= 1) return;
    setChatHistory((prev) =>
      [{ id: `session_${now}`, endedAt: new Date(now).toISOString(), messages: current }, ...prev].slice(
        0,
        MAX_CHAT_HISTORY,
      ),
    );
    setMessages([GREETING]);
    messagesRef.current = [GREETING];
  };

  const greet = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      archiveIfIdle();
      push({ role: 'assistant', content: text });
      deps.speak(text);
    },
    [deps],
  );

  const sendMessage = useCallback(
    async (raw: string, origin: 'text' | 'voice' = 'text') => {
      const text = raw.trim();
      if (!text || thinkingRef.current) return;
      archiveIfIdle();
      // Voice always gets a spoken reply; typed only does if opted in.
      const shouldSpeak = origin === 'voice' || deps.speakOnText;
      const speak = (t: string) => shouldSpeak && deps.speak(t);

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userMsg = { role: 'user', content: text } as JarvisMessage;
      const uiHistory = [...messagesRef.current, userMsg];
      setMessages(uiHistory);
      // The model's context keeps the full conversation regardless of what's
      // visibly on screen — an idle-reset clears the display, not Jarvis's
      // memory of what was discussed.
      const fullHistory = [...modelHistoryRef.current, userMsg];
      modelHistoryRef.current = fullHistory;
      const history = toModelHistory(fullHistory);
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

  return { messages, thinking, sendMessage, greet, abort, chatHistory };
}
