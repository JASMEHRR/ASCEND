import { useEffect, useRef } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';
import { useGoogle } from '../google/GoogleContext';
import { listInbox, createDraft, type MailSummary } from './gmailClient';

/**
 * Gmail module: inbox summaries, urgent flagging, and DRAFT replies for the
 * user's approval. Sending is deliberately not implemented anywhere — the user
 * reviews drafts in Gmail itself.
 *
 * Unread counts are polled into a ref and served through Jarvis's context so
 * "anything urgent in my inbox?" can be answered without a tool round-trip.
 */
export default function GmailRegistrar() {
  const { registerTools, registerContext } = useJarvis();
  const google = useGoogle();

  const inboxRef = useRef<MailSummary[] | null>(null);
  const googleRef = useRef(google);
  googleRef.current = google;

  useEffect(() => {
    if (!google.connected) {
      inboxRef.current = null;
      return;
    }
    let stop = false;
    const load = async () => {
      const token = await googleRef.current.getToken();
      if (!token || stop) return;
      try {
        const mail = await listInbox(token, { unreadOnly: true, max: 10 });
        if (!stop) inboxRef.current = mail;
      } catch {
        /* best-effort cache */
      }
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [google.connected]);

  useEffect(() => {
    return registerContext('gmail', () => {
      if (!googleRef.current.connected) {
        return { gmail: { connected: false, note: 'Gmail not connected. The user can connect Google in Settings.' } };
      }
      const mail = inboxRef.current ?? [];
      return {
        gmail: {
          unreadCount: mail.length,
          urgentCount: mail.filter((m) => m.looksUrgent).length,
          unread: mail.slice(0, 6).map((m) => ({ from: m.from, subject: m.subject, urgent: m.looksUrgent })),
          note: 'Use readInbox for details/snippets; use createDraftReply to draft (never send) replies.',
        },
      };
    });
  }, [registerContext]);

  useEffect(() => {
    const tools: JarvisTool[] = [
      {
        name: 'readInbox',
        module: 'Gmail',
        description:
          "Read recent inbox mail (metadata + snippet) to summarize it or flag urgent items. Use when the user asks about their email.",
        parameters: {
          unreadOnly: 'true to read only unread mail (default true)',
          max: 'how many messages (default 10, max 25)',
        },
        followUp: true,
        execute: async (a) => {
          const token = await googleRef.current.getToken();
          if (!token) return { ok: false, message: 'Gmail is not connected (Settings → Google Account).' };
          try {
            const mail = await listInbox(token, {
              unreadOnly: a.unreadOnly === undefined ? true : String(a.unreadOnly) !== 'false',
              max: Number(a.max) || 10,
            });
            return {
              ok: true,
              message: `read ${mail.length} message${mail.length === 1 ? '' : 's'}`,
              data: mail.map((m) => ({
                id: m.id,
                threadId: m.threadId,
                from: m.from,
                subject: m.subject,
                date: m.date,
                snippet: m.snippet,
                urgent: m.looksUrgent,
              })),
            };
          } catch (e) {
            return { ok: false, message: `inbox read failed: ${(e as Error).message}` };
          }
        },
      },
      {
        name: 'createDraftReply',
        module: 'Gmail',
        description:
          'Create a DRAFT email in Gmail for the user to review and send themselves. Never sends. Pass threadId (from readInbox) to make it a reply in that conversation.',
        parameters: {
          to: 'recipient address',
          subject: 'subject line (prefix "Re: " for replies)',
          body: 'plain-text draft body',
          threadId: 'optional thread id from readInbox to reply within',
        },
        validate: (a) => {
          if (!String(a.to ?? '').includes('@')) return 'a valid "to" address is required';
          if (!String(a.subject ?? '').trim()) return 'subject is required';
          if (!String(a.body ?? '').trim()) return 'body is required';
          return null;
        },
        execute: async (a) => {
          const token = await googleRef.current.getToken();
          if (!token) return { ok: false, message: 'Gmail is not connected (Settings → Google Account).' };
          try {
            await createDraft(token, {
              to: String(a.to).trim(),
              subject: String(a.subject).trim(),
              body: String(a.body),
              threadId: a.threadId ? String(a.threadId) : undefined,
            });
            return { ok: true, message: `draft created in Gmail (awaiting the user's review — not sent)` };
          } catch (e) {
            return { ok: false, message: `draft creation failed: ${(e as Error).message}` };
          }
        },
      },
    ];
    return registerTools('gmail', tools);
  }, [registerTools]);

  return null;
}
