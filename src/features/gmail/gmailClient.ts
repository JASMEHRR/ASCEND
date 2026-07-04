/**
 * Thin Gmail REST client. Read-only inbox access + DRAFT creation only —
 * this app never sends mail on the user's behalf.
 */

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface MailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  /** Cheap keyword heuristic; the model applies its own judgement on top. */
  looksUrgent: boolean;
}

class GmailApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function gfetch(token: string, url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GmailApiError(res.status, data?.error?.message ?? `Gmail API error ${res.status}`);
  return data;
}

const URGENT_RE = /\b(urgent|asap|immediately|action required|deadline|overdue|final notice|expiring|last chance)\b/i;

function header(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** Recent inbox messages (metadata only), newest first. */
export async function listInbox(token: string, opts: { unreadOnly?: boolean; max?: number } = {}): Promise<MailSummary[]> {
  const q = opts.unreadOnly ? 'in:inbox is:unread' : 'in:inbox';
  const params = new URLSearchParams({ q, maxResults: String(Math.min(opts.max ?? 12, 25)) });
  const list = await gfetch(token, `${BASE}/messages?${params}`);
  const ids: { id: string; threadId: string }[] = list.messages ?? [];
  const out: MailSummary[] = [];
  for (const m of ids) {
    const msg = await gfetch(
      token,
      `${BASE}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    const subject = header(msg.payload?.headers, 'Subject');
    const snippet = String(msg.snippet ?? '');
    out.push({
      id: m.id,
      threadId: m.threadId,
      from: header(msg.payload?.headers, 'From'),
      subject,
      date: header(msg.payload?.headers, 'Date'),
      snippet,
      unread: (msg.labelIds ?? []).includes('UNREAD'),
      looksUrgent: URGENT_RE.test(subject) || URGENT_RE.test(snippet),
    });
  }
  return out;
}

/** Unicode-safe base64url for the RFC822 payload. */
function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create a DRAFT (never sent). When threadId is given the draft lands in that
 * conversation as a reply.
 */
export async function createDraft(
  token: string,
  draft: { to: string; subject: string; body: string; threadId?: string },
): Promise<{ id: string }> {
  const mime = [
    `To: ${draft.to}`,
    `Subject: ${draft.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    draft.body,
  ].join('\r\n');
  const data = await gfetch(token, `${BASE}/drafts`, {
    method: 'POST',
    body: JSON.stringify({ message: { raw: b64url(mime), ...(draft.threadId ? { threadId: draft.threadId } : {}) } }),
  });
  return { id: data.id };
}
