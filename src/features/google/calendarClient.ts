/**
 * Thin Google Calendar REST client (primary calendar). All calls take a live
 * access token from GoogleContext — no state of its own.
 */

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string; // RFC3339 or date
  end: string;
  htmlLink?: string;
}

export class GoogleApiError extends Error {
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
  if (!res.ok) throw new GoogleApiError(res.status, data?.error?.message ?? `Google API error ${res.status}`);
  return data;
}

const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Events between two instants, expanded and time-ordered. */
export async function listEvents(token: string, timeMin: Date, timeMax: Date, maxResults = 20): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });
  const data = await gfetch(token, `${BASE}?${params}`);
  return ((data.items ?? []) as any[]).map((e) => ({
    id: e.id,
    summary: e.summary ?? '(untitled)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    htmlLink: e.htmlLink,
  }));
}

export async function createEvent(
  token: string,
  event: { title: string; start: Date; end: Date; description?: string },
): Promise<CalendarEvent> {
  const tz = localTimeZone();
  const data = await gfetch(token, BASE, {
    method: 'POST',
    body: JSON.stringify({
      summary: event.title,
      description: event.description,
      start: { dateTime: event.start.toISOString(), timeZone: tz },
      end: { dateTime: event.end.toISOString(), timeZone: tz },
    }),
  });
  return {
    id: data.id,
    summary: data.summary ?? event.title,
    start: data.start?.dateTime ?? '',
    end: data.end?.dateTime ?? '',
    htmlLink: data.htmlLink,
  };
}

export async function deleteEvent(token: string, eventId: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 410) throw new GoogleApiError(res.status, `Failed to delete event (${res.status})`);
}

/** Parse "HH:MM" (24h) into a Date today; returns null when malformed. */
export function todayAt(hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}
