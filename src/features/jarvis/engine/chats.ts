/**
 * Firestore layer for Jarvis chat threads.
 *
 *   users/{uid}/jarvisChats/{chatId}
 *
 * Each chat is its own document holding its own transcript, so conversations
 * stay separate the way they do in Claude or Cursor — a chat about your
 * portfolio doesn't bleed into one about your habits. Covered by the existing
 * blanket users/{userId}/{document=**} rule, so no firestore.rules change is
 * needed for this.
 *
 * This replaces the previous single-transcript design (users/{uid}/jarvis/chat
 * plus a chatHistory archive doc), which could only ever hold one conversation.
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { JarvisMessage } from '../types';

/** Keep any single thread from growing without bound. */
export const MAX_MESSAGES_PER_CHAT = 200;

export interface ChatThread {
  id: string;
  /** Short label shown in the chat list. Generated after the first exchange. */
  title: string;
  createdAt: string;
  /** Drives chat-list ordering (most recently used first). */
  updatedAt: string;
  messages: JarvisMessage[];
}

/** What the chat list needs — the transcript itself is only loaded on open. */
export type ChatSummary = Omit<ChatThread, 'messages'>;

const chatsPath = (uid: string) => `users/${uid}/jarvisChats`;

export function newChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Live-subscribe to the user's chat list, newest activity first. Returns
 * summaries plus each thread's messages, so switching chats is instant and
 * offline-tolerant rather than requiring a fetch per chat.
 */
export function subscribeChats(uid: string, cb: (chats: ChatThread[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, chatsPath(uid)), orderBy('updatedAt', 'desc')),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Omit<ChatThread, 'id'>;
          return {
            id: d.id,
            title: data.title ?? 'New chat',
            createdAt: data.createdAt ?? new Date().toISOString(),
            updatedAt: data.updatedAt ?? data.createdAt ?? new Date().toISOString(),
            messages: Array.isArray(data.messages) ? data.messages : [],
          };
        }),
      ),
    (err) => {
      console.warn('[jarvis chats] listener error:', err.message);
      cb([]);
    },
  );
}

/** Create (or overwrite) a chat document. */
export async function saveChat(uid: string, chat: ChatThread): Promise<void> {
  const { id, ...body } = chat;
  await setDoc(doc(db, chatsPath(uid), id), {
    ...body,
    messages: body.messages.slice(-MAX_MESSAGES_PER_CHAT),
  });
}

/** Patch just the fields given, leaving the rest of the document alone. */
export async function patchChat(
  uid: string,
  chatId: string,
  fields: Partial<Omit<ChatThread, 'id'>>,
): Promise<void> {
  const body: Record<string, unknown> = { ...fields, updatedAt: new Date().toISOString() };
  if (Array.isArray(fields.messages)) body.messages = fields.messages.slice(-MAX_MESSAGES_PER_CHAT);
  await setDoc(doc(db, chatsPath(uid), chatId), body, { merge: true });
}

export async function deleteChat(uid: string, chatId: string): Promise<void> {
  await deleteDoc(doc(db, chatsPath(uid), chatId));
}

/**
 * Fallback title from the first user message — used immediately so the chat
 * list never shows a blank entry, then replaced by the model-generated one.
 */
export function draftTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New chat';
  return clean.length <= 40 ? clean : `${clean.slice(0, 40).trimEnd()}…`;
}
