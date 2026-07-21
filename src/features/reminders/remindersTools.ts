import type { JarvisTool } from '../jarvis/types';
import type { Reminder } from '../../hooks/useReminders';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const fuzzy = (a: string, b: string) =>
  a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

interface Deps {
  pendingRef: { current: Reminder[] };
  addReminder: (text: string, dueAtISO: string) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
}

/** Jarvis tools for reminders, matching the desktop app's tool declarations. */
export function createReminderTools({ pendingRef, addReminder, completeReminder, deleteReminder }: Deps): JarvisTool[] {
  return [
    {
      name: 'set_reminder',
      module: 'Reminders',
      description: 'Create a reminder for a specific date and time.',
      parameters: { text: 'what to remind', time: 'ISO local datetime, e.g. 2026-07-20T09:00' },
      validate: (a) => {
        if (!str(a.text)) return 'reminder text is required';
        if (Number.isNaN(new Date(str(a.time)).getTime())) return 'a valid date/time is required';
        return null;
      },
      execute: async (a) => {
        const text = str(a.text);
        await addReminder(text, new Date(str(a.time)).toISOString());
        return { ok: true, message: `reminder set: ${text}` };
      },
    },
    {
      name: 'complete_reminder',
      module: 'Reminders',
      description: 'Mark a matching pending reminder as done.',
      parameters: { match: 'words from the reminder text to match' },
      validate: (a) => (str(a.match) ? null : 'need text to match'),
      execute: async (a) => {
        const match = str(a.match);
        const hit = pendingRef.current.find((r) => fuzzy(r.text, match));
        if (!hit) return { ok: false, message: `no pending reminder matches "${match}"` };
        await completeReminder(hit.id);
        return { ok: true, message: `completed: ${hit.text}` };
      },
    },
    {
      name: 'delete_reminder',
      module: 'Reminders',
      description: 'Delete a matching pending reminder.',
      parameters: { match: 'words from the reminder text to match' },
      validate: (a) => (str(a.match) ? null : 'need text to match'),
      execute: async (a) => {
        const match = str(a.match);
        const hit = pendingRef.current.find((r) => fuzzy(r.text, match));
        if (!hit) return { ok: false, message: `no pending reminder matches "${match}"` };
        await deleteReminder(hit.id);
        return { ok: true, message: `deleted: ${hit.text}` };
      },
    },
  ];
}
