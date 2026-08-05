import { useCallback, useEffect, useRef, useState } from 'react';
import { callJarvis } from './jarvisClient';
import {
  deleteChat as deleteChatDoc,
  draftTitle,
  newChatId,
  patchChat,
  saveChat,
  subscribeChats,
  type ChatThread,
} from './chats';
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
  /** Signed-in uid, for persisting chats. Null while signed out. */
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
  /** Every saved conversation, newest activity first. */
  chats: ChatThread[];
  /** null means "no chat open" — the dashboard's default home screen. */
  activeChatId: string | null;
  /** Drop back to the home screen without deleting anything. */
  newChat: () => void;
  openChat: (id: string) => void;
  removeChat: (id: string) => void;
}

/**
 * Drives a turn: plan (one LLM call that can propose several tool calls with
 * confidences) → validate + execute each above threshold → optionally summarize
 * the outcome. The LLM call retries once; tool side-effects never auto-retry
 * (idempotency). Failures degrade gracefully and are reported, not thrown away.
 *
 * Conversations are separate, persisted threads (see chats.ts) rather than one
 * endless transcript — `activeChatId === null` is the home screen, and sending
 * a message from there starts a brand new chat.
 */
export function useConversation(deps: ConversationDeps): Conversation {
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JarvisMessage[]>([GREETING]);
  const [thinking, setThinking] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const thinkingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Chat ids this session created/owns, so the write-effect never persists a
   *  transcript into a chat it hasn't actually opened yet. */
  const ownedRef = useRef<Set<string>>(new Set());
  const lastWriteRef = useRef('');

  // Live chat list. Switching users resets everything back to the home screen.
  useEffect(() => {
    const uid = deps.uid;
    setChats([]);
    setActiveChatId(null);
    setMessages([GREETING]);
    ownedRef.current = new Set();
    lastWriteRef.current = '';
    if (!uid) return;
    return subscribeChats(uid, setChats);
  }, [deps.uid]);

  /** Persist the open chat's transcript, debounced. */
  useEffect(() => {
    const uid = deps.uid;
    const chatId = activeChatId;
    if (!uid || !chatId) return;
    if (!ownedRef.current.has(chatId)) return;
    if (messages.length === 0) return;
    const payload = JSON.stringify(messages);
    if (payload === lastWriteRef.current) return;
    const t = setTimeout(() => {
      lastWriteRef.current = payload;
      void patchChat(uid, chatId, { messages }).catch((err) =>
        console.warn('[jarvis chats] write failed:', (err as Error).message),
      );
    }, 700);
    return () => clearTimeout(t);
  }, [messages, activeChatId, deps.uid]);

  const push = (msg: JarvisMessage) => setMessages((prev) => [...prev, msg]);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  /** Back to the home screen. The previous chat stays saved in the list. */
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setActiveChatId(null);
    setMessages([GREETING]);
    lastWriteRef.current = '';
  }, []);

  const openChat = useCallback((id: string) => {
    abortRef.current?.abort();
    const found = chatsRef.current.find((c) => c.id === id);
    if (!found) return;
    ownedRef.current.add(id);
    setActiveChatId(id);
    const loaded = found.messages.length > 0 ? found.messages : [GREETING];
    setMessages(loaded);
    lastWriteRef.current = JSON.stringify(loaded);
  }, []);

  const removeChat = useCallback(
    (id: string) => {
      const uid = deps.uid;
      if (!uid) return;
      if (activeChatIdRef.current === id) {
        setActiveChatId(null);
        setMessages([GREETING]);
        lastWriteRef.current = '';
      }
      ownedRef.current.delete(id);
      void deleteChatDoc(uid, id).catch((err) =>
        console.warn('[jarvis chats] delete failed:', (err as Error).message),
      );
    },
    [deps.uid],
  );

  /**
   * Ask the model for a short title once a chat has its first exchange, so the
   * chat list reads like a list of topics rather than truncated first lines.
   * Best-effort: the draft title stays if this fails.
   */
  const titleChat = useCallback(
    async (uid: string, chatId: string, exchange: JarvisMessage[]) => {
      try {
        const res = await callJarvis(
          [
            ...toModelHistory(exchange),
            {
              role: 'user',
              content:
                'Give this conversation a title of at most 5 words. Reply with the title text only — no quotes, no punctuation at the end, no explanation.',
            },
          ],
          {},
          [],
        );
        const title = res.reply.trim().replace(/^["']|["']$/g, '').slice(0, 60);
        if (title) await patchChat(uid, chatId, { title });
      } catch {
        /* keep the draft title */
      }
    },
    [],
  );

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
      const uid = deps.uid;
      // Voice always gets a spoken reply; typed only does if opted in.
      const shouldSpeak = origin === 'voice' || deps.speakOnText;
      const speak = (t: string) => shouldSpeak && deps.speak(t);

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Sending from the home screen starts a fresh chat.
      let chatId = activeChatIdRef.current;
      let isNew = false;
      if (!chatId) {
        chatId = newChatId();
        isNew = true;
        ownedRef.current.add(chatId);
        activeChatIdRef.current = chatId;
        setActiveChatId(chatId);
        if (uid) {
          const now = new Date().toISOString();
          void saveChat(uid, {
            id: chatId,
            title: draftTitle(text),
            createdAt: now,
            updatedAt: now,
            messages: [],
          }).catch((err) => console.warn('[jarvis chats] create failed:', (err as Error).message));
        }
      }

      const userMsg = { role: 'user', content: text } as JarvisMessage;
      const history = [...messagesRef.current, userMsg];
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
        const plan = await callJarvis(toModelHistory(history), context, decls, ctrl.signal);

        if (plan.needsClarification || plan.toolCalls.length === 0) {
          push({ role: 'assistant', content: plan.reply });
          speak(spokenOf(plan));
          if (isNew && uid) void titleChat(uid, chatId, [userMsg, { role: 'assistant', content: plan.reply }]);
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
            ...toModelHistory(history),
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
        if (isNew && uid) void titleChat(uid, chatId, [userMsg, { role: 'assistant', content: reply }]);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        push({ role: 'assistant', content: `Connection issue: ${(e as Error).message}. Try again.` });
      } finally {
        thinkingRef.current = false;
        setThinking(false);
      }
    },
    // deps are all stable callbacks from their hooks
    [deps, titleChat],
  );

  return { messages, thinking, sendMessage, greet, abort, chats, activeChatId, newChat, openChat, removeChat };
}
