import { useEffect, useRef } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';
import { useGoogle } from '../google/GoogleContext';
import { listEvents, createEvent, todayAt, type CalendarEvent } from '../google/calendarClient';
import { usePlanning, type PlanBlock } from './PlanningContext';

const HHMM = /^\d{1,2}:\d{2}$/;

function parseBlocks(raw: unknown): PlanBlock[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'blocks must be a non-empty array';
  const blocks: PlanBlock[] = [];
  for (const b of raw) {
    if (!b || typeof b !== 'object') return 'each block must be an object';
    const o = b as Record<string, unknown>;
    const start = String(o.start ?? '').trim();
    const end = String(o.end ?? '').trim();
    const title = String(o.title ?? '').trim();
    if (!HHMM.test(start) || !HHMM.test(end)) return `block "${title || '?'}" needs start/end as "HH:MM" 24h`;
    if (!title) return 'every block needs a title';
    blocks.push({ start, end, title, notes: o.notes ? String(o.notes) : undefined });
  }
  return blocks;
}

/**
 * AI Daily Planning + Google Calendar awareness.
 *
 * - proposeDayPlan stages a plan for EXPLICIT user approval (approval card on
 *   the dashboard); approval is what writes to Calendar — never the model.
 * - Today's calendar events are polled into a ref and served to Jarvis's
 *   context (read side of the two-way sync), so "what's on my calendar?"
 *   answers straight from context.
 * - createCalendarEvent exists for direct one-off requests; listCalendarEvents
 *   reads ahead further than the cached today-window.
 */
export default function PlanningRegistrar() {
  const { registerTools, registerContext } = useJarvis();
  const google = useGoogle();
  const planning = usePlanning();

  const eventsRef = useRef<CalendarEvent[] | null>(null);
  const googleRef = useRef(google);
  googleRef.current = google;
  const planningRef = useRef(planning);
  planningRef.current = planning;

  // Poll today's events (read side of the sync) while connected.
  useEffect(() => {
    if (!google.connected) {
      eventsRef.current = null;
      return;
    }
    let stop = false;
    const load = async () => {
      const token = await googleRef.current.getToken();
      if (!token || stop) return;
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const events = await listEvents(token, start, end, 25);
        if (!stop) eventsRef.current = events;
      } catch {
        /* keep last snapshot; context stays best-effort */
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
    return registerContext('planning', () => ({
      googleCalendar: googleRef.current.connected
        ? {
            todayEvents: (eventsRef.current ?? []).map((e) => ({ title: e.summary, start: e.start, end: e.end })),
            note: 'Two-way sync is on: propose day plans with proposeDayPlan; the user approves before events are created.',
          }
        : { connected: false, note: 'Google Calendar not connected. The user can connect it in Settings.' },
    }));
  }, [registerContext]);

  useEffect(() => {
    const tools: JarvisTool[] = [
      {
        name: 'proposeDayPlan',
        module: 'Planning',
        description:
          "Stage a time-blocked plan for the user's day. It is NOT applied until the user approves the plan card shown on their dashboard. Use for 'plan my day' style requests.",
        parameters: {
          blocks: 'array of {start:"HH:MM", end:"HH:MM", title, notes?} in 24h local time, ordered',
          rationale: 'optional one-line reason behind the structure',
        },
        validate: (a) => (typeof parseBlocks(a.blocks) === 'string' ? (parseBlocks(a.blocks) as string) : null),
        execute: (a) => {
          const blocks = parseBlocks(a.blocks);
          if (typeof blocks === 'string') return { ok: false, message: blocks };
          planningRef.current.propose(blocks, a.rationale ? String(a.rationale) : undefined);
          return {
            ok: true,
            message: `day plan staged (${blocks.length} blocks) — awaiting user approval on the dashboard`,
          };
        },
      },
      {
        name: 'listCalendarEvents',
        module: 'Planning',
        description: "Read the user's Google Calendar events for the next N days (today's events are already in context).",
        parameters: { days: 'how many days ahead to read (default 1, max 14)' },
        followUp: true,
        execute: async (a) => {
          const token = await googleRef.current.getToken();
          if (!token) return { ok: false, message: 'Google Calendar is not connected (Settings → Google Account).' };
          const days = Math.min(Math.max(Math.round(Number(a.days) || 1), 1), 14);
          const start = new Date();
          const end = new Date();
          end.setDate(end.getDate() + days);
          try {
            const events = await listEvents(token, start, end, 40);
            return {
              ok: true,
              message: `read ${events.length} calendar event${events.length === 1 ? '' : 's'}`,
              data: events.map((e) => ({ title: e.summary, start: e.start, end: e.end })),
            };
          } catch (e) {
            return { ok: false, message: `calendar read failed: ${(e as Error).message}` };
          }
        },
      },
      {
        name: 'createCalendarEvent',
        module: 'Planning',
        description: 'Create ONE Google Calendar event today at a specific time, when the user explicitly asks for it.',
        parameters: { title: 'event title', start: '"HH:MM" 24h', end: '"HH:MM" 24h', notes: 'optional description' },
        validate: (a) => {
          if (!String(a.title ?? '').trim()) return 'title is required';
          if (!todayAt(String(a.start ?? ''))) return 'start must be "HH:MM" 24h';
          if (!todayAt(String(a.end ?? ''))) return 'end must be "HH:MM" 24h';
          return null;
        },
        execute: async (a) => {
          const token = await googleRef.current.getToken();
          if (!token) return { ok: false, message: 'Google Calendar is not connected (Settings → Google Account).' };
          try {
            const ev = await createEvent(token, {
              title: String(a.title).trim(),
              start: todayAt(String(a.start))!,
              end: todayAt(String(a.end))!,
              description: a.notes ? String(a.notes) : undefined,
            });
            return { ok: true, message: `event created: ${ev.summary} (${String(a.start)}–${String(a.end)})` };
          } catch (e) {
            return { ok: false, message: `event creation failed: ${(e as Error).message}` };
          }
        },
      },
    ];
    return registerTools('planning', tools);
  }, [registerTools]);

  return null;
}
