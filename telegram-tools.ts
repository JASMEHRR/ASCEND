/**
 * Write tools for the Telegram surface.
 *
 * Every other client executes tool calls itself — the browser and Electron
 * both hold an authenticated Firestore session. Telegram has no client at
 * all, so the webhook has to execute them here, server-side, through the
 * Admin SDK.
 *
 * Deliberately narrow. These three write to collections the phone and
 * desktop apps already watch live, so a reminder set from a text message
 * appears (and fires) in the other apps without any further plumbing.
 * Anything that reaches outside Ascend's own Firestore — Post Studio's
 * drafts, LinkedIn, Gmail — is NOT here: the webhook runs on Vercel and
 * cannot reach the user's laptop, and publishing deserves a confirmation
 * step this surface doesn't have.
 */
import { getAdminDb } from './admin-db';
import { todayStr } from './src/features/arena/logic/dates';
import type { Habit } from './src/features/arena/logic/types';

/** Same ToolDecl shape jarvis-routes.ts declares — flat key -> description. */
export const TELEGRAM_TOOLS = [
  {
    name: 'setReminder',
    module: 'reminders',
    description:
      "Create a reminder that pops up on the user's desktop and in Ascend at the given time. Use for 'remind me to X at Y', 'wake me at 6', 'ping me before the call'.",
    parameters: {
      text: 'what to remind them about, in their own words',
      time: 'ISO 8601 local datetime, e.g. 2026-09-15T18:30:00',
    },
  },
  {
    name: 'addHabit',
    module: 'Arena',
    description:
      "Add a habit to the user's Arena board. Use for 'track X', 'add a habit', 'I want to start doing X'. Note it starts counting tomorrow, not today.",
    parameters: {
      label: 'the habit name, e.g. "Read 30 minutes"',
      target: 'optional number of reps needed per day (default 1)',
      unit: 'optional unit for counter habits, e.g. "glasses"',
    },
  },
  {
    name: 'tickHabit',
    module: 'Arena',
    description:
      "Mark one of the user's existing habits done for today. Match the habit by name, case-insensitively.",
    parameters: {
      habit: 'the habit name to mark done',
      value: 'optional reps for counter habits',
    },
  },
];

const fuzzy = (a: string, b: string) =>
  a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

/**
 * Runs one tool call and returns a short human-readable result. Never throws:
 * a failed tool must not take down the reply that's already been written, and
 * the string comes back to the user appended to it.
 */
export async function runTelegramTool(
  uid: string,
  call: { tool?: string; args?: Record<string, unknown> },
): Promise<string> {
  const args = call.args ?? {};
  const db = await getAdminDb();
  if (!db) return 'storage unavailable';

  try {
    switch (call.tool) {
      case 'setReminder': {
        const text = String(args.text ?? '').trim();
        const time = String(args.time ?? '').trim();
        const due = new Date(time);
        if (!text) return 'reminder needs something to say';
        if (!time || Number.isNaN(due.getTime())) return 'reminder failed (bad time)';
        // Same shape jarvis-desktop writes, so its existing listener picks
        // this up and schedules the notification with no changes there.
        await db.collection(`users/${uid}/reminders`).add({
          text,
          dueAt: due.toISOString(),
          done: false,
          notified: false,
          createdAt: new Date().toISOString(),
          source: 'telegram',
        });
        return `reminder set for ${due.toLocaleString()}`;
      }

      case 'addHabit': {
        const label = String(args.label ?? '').trim();
        if (!label) return 'habit needs a name';
        const target = Math.max(1, Math.round(Number(args.target) || 1));
        await db.collection(`users/${uid}/arenaHabits`).add({
          label,
          kind: 'good',
          icon: 'check',
          color: '#10b981',
          ...(target > 1 ? { target } : {}),
          ...(args.unit ? { unit: String(args.unit) } : {}),
          startsAt: todayStr(),
          createdAt: new Date().toISOString(),
        });
        return `added "${label}" — starts counting tomorrow`;
      }

      case 'tickHabit': {
        const needle = String(args.habit ?? '').trim();
        if (!needle) return 'which habit?';
        const snap = await db.collection(`users/${uid}/arenaHabits`).get();
        const habits = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Habit);
        const hit =
          habits.find((h) => h.label?.toLowerCase() === needle.toLowerCase()) ??
          habits.find((h) => fuzzy(String(h.label ?? ''), needle));
        if (!hit) return `no habit matching "${needle}"`;

        // Day docs hold every habit's value for that date, so this is a
        // read-modify-write of one map rather than a per-habit document.
        const today = todayStr();
        const dayRef = db.doc(`users/${uid}/arenaDays/${today}`);
        const daySnap = await dayRef.get();
        const values = ((daySnap.exists ? daySnap.data()?.values : {}) ?? {}) as Record<string, number>;
        const target = hit.target && hit.target > 0 ? hit.target : 1;
        values[hit.id] = Math.max(1, Math.round(Number(args.value) || target));
        await dayRef.set({ values, updatedAt: new Date().toISOString() });
        return `${hit.label} marked done`;
      }

      default:
        return `unknown tool: ${call.tool}`;
    }
  } catch (err) {
    return `${call.tool} failed: ${(err as Error).message}`;
  }
}
