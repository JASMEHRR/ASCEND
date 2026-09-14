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
import { fetchQuote } from './stocks-routes';

/** Same ToolDecl shape jarvis-routes.ts declares — flat key -> description. */
export const TELEGRAM_TOOLS = [
  {
    name: 'setReminder',
    module: 'reminders',
    description:
      "Create a reminder that pops up on the user's desktop and in Ascend at the given time. Use for 'remind me to X at Y', 'wake me at 6', 'ping me before the call'.",
    parameters: {
      text: 'what to remind them about, in their own words',
      time: 'ISO 8601 local datetime of the FIRST occurrence, e.g. 2026-09-15T18:30:00',
      repeatMinutes: 'optional: repeat every N minutes after that (e.g. 120 for every 2 hours), for things like "remind me to drink water". Omit for a one-time reminder.',
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
    name: 'listReminders',
    module: 'reminders',
    description:
      "List the user's pending reminders with their due times. Use before deleting or editing one so you can name exactly which is which.",
    parameters: {},
  },
  {
    name: 'deleteReminder',
    module: 'reminders',
    description:
      "Delete a pending reminder. Use for 'cancel that reminder', 'delete the bank one', 'clear my reminders'. Matches on words from the reminder text.",
    parameters: { match: 'words from the reminder text, or "all" to clear every pending one' },
  },
  {
    name: 'editReminder',
    module: 'reminders',
    description:
      "Change a pending reminder's text or time. Matches the existing one on words from its text.",
    parameters: {
      match: 'words from the current reminder text to find it',
      text: 'optional new text',
      time: 'optional new ISO 8601 local datetime',
      repeatMinutes: 'optional: set to repeat every N minutes, or 0 to stop it repeating',
    },
  },
  {
    name: 'setPriceAlert',
    module: 'stocks',
    description:
      "Create a one-shot price alert: text the user once when a stock/ETF crosses the given price. Use for 'ping me when X hits Y', 'let me know if X drops below Y'. Symbol format matches Yahoo Finance (RELIANCE.NS, TCS.BO, AAPL).",
    parameters: {
      symbol: 'ticker symbol, e.g. RELIANCE.NS or AAPL',
      target: 'the price to watch for',
      direction: '"above" or "below" — which way it needs to cross to fire',
    },
  },
  {
    name: 'listPriceAlerts',
    module: 'stocks',
    description: "List the user's active (not yet fired) price alerts.",
    parameters: {},
  },
  {
    name: 'deletePriceAlert',
    module: 'stocks',
    description: "Cancel a price alert. Matches on the ticker symbol, or 'all' to clear every active one.",
    parameters: { symbol: 'the ticker symbol to cancel, or "all"' },
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

// Vercel's server clock is UTC; the user is IST. Every time shown back to
// them must go through this, not the server-locale .toLocaleString() (which
// silently renders UTC and reads as "wrong by 5:30" with no indication why).
const IST = 'Asia/Kolkata';
const toIST = (d: Date) => d.toLocaleString('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'short' });

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
        const repeatMinutes = Math.round(Number(args.repeatMinutes) || 0);
        // Same shape jarvis-desktop writes, so its existing listener picks
        // this up and schedules the notification with no changes there.
        await db.collection(`users/${uid}/reminders`).add({
          text,
          dueAt: due.toISOString(),
          done: false,
          notified: false,
          createdAt: new Date().toISOString(),
          source: 'telegram',
          ...(repeatMinutes > 0 ? { repeatMinutes } : {}),
        });
        return repeatMinutes > 0
          ? `set — first at ${toIST(due)} IST, then every ${repeatMinutes} min`
          : `reminder set for ${toIST(due)} IST`;
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

      case 'listReminders': {
        const snap = await db.collection(`users/${uid}/reminders`).get();
        const pending = snap.docs
          .map((d) => d.data() as { text?: string; dueAt?: string; done?: boolean })
          .filter((r) => !r.done);
        if (!pending.length) return 'no pending reminders';
        return pending
          .map((r) => `"${r.text}" at ${r.dueAt ? toIST(new Date(r.dueAt)) + ' IST' : 'no time'}`)
          .join(' · ');
      }

      case 'deleteReminder': {
        const match = String(args.match ?? '').trim();
        if (!match) return 'which reminder?';
        const snap = await db.collection(`users/${uid}/reminders`).get();
        const pending = snap.docs.filter((d) => !(d.data() as { done?: boolean }).done);

        if (match.toLowerCase() === 'all') {
          if (!pending.length) return 'no pending reminders to clear';
          for (const d of pending) await db.doc(`users/${uid}/reminders/${d.id}`).delete();
          return `cleared ${pending.length} reminder${pending.length === 1 ? '' : 's'}`;
        }

        const hit = pending.find((d) => fuzzy(String((d.data() as { text?: string }).text ?? ''), match));
        if (!hit) return `no reminder matching "${match}"`;
        const text = String((hit.data() as { text?: string }).text ?? '');
        await db.doc(`users/${uid}/reminders/${hit.id}`).delete();
        return `deleted "${text}"`;
      }

      case 'editReminder': {
        const match = String(args.match ?? '').trim();
        if (!match) return 'which reminder?';
        const snap = await db.collection(`users/${uid}/reminders`).get();
        const hit = snap.docs
          .filter((d) => !(d.data() as { done?: boolean }).done)
          .find((d) => fuzzy(String((d.data() as { text?: string }).text ?? ''), match));
        if (!hit) return `no reminder matching "${match}"`;

        const fields: Record<string, unknown> = {};
        if (args.text) fields.text = String(args.text).trim();
        if (args.time) {
          const due = new Date(String(args.time));
          if (Number.isNaN(due.getTime())) return 'that time did not parse';
          fields.dueAt = due.toISOString();
          // Re-arm it: the desktop app skips anything already notified, so a
          // rescheduled reminder that kept notified:true would never fire.
          fields.notified = false;
        }
        if (args.repeatMinutes !== undefined) {
          const n = Math.round(Number(args.repeatMinutes) || 0);
          fields.repeatMinutes = n > 0 ? n : null; // null reads as falsy everywhere this field is checked
        }
        if (!Object.keys(fields).length) return 'nothing to change';
        await db.doc(`users/${uid}/reminders/${hit.id}`).update(fields);
        return `updated "${String((hit.data() as { text?: string }).text ?? '')}"`;
      }

      case 'setPriceAlert': {
        const symbol = String(args.symbol ?? '').trim().toUpperCase();
        const target = Number(args.target);
        const direction = String(args.direction ?? '').toLowerCase();
        if (!symbol) return 'needs a ticker symbol';
        if (!Number.isFinite(target) || target <= 0) return 'needs a real target price';
        if (direction !== 'above' && direction !== 'below') return 'direction must be "above" or "below"';

        // Fail loudly on a bad symbol now rather than silently never firing —
        // the user finds out immediately instead of days later.
        const quote = await fetchQuote(symbol);
        if (!quote) return `couldn't find a quote for "${symbol}" — check the symbol`;

        await db.collection(`users/${uid}/priceAlerts`).add({
          symbol,
          target,
          direction,
          firedAt: null,
          createdAt: new Date().toISOString(),
        });
        return `watching ${symbol} (currently ${quote.price}) for ${direction} ${target}`;
      }

      case 'listPriceAlerts': {
        const snap = await db.collection(`users/${uid}/priceAlerts`).get();
        const active = snap.docs
          .map((d) => d.data() as { symbol?: string; target?: number; direction?: string; firedAt?: string | null })
          .filter((a) => !a.firedAt);
        if (!active.length) return 'no active price alerts';
        return active.map((a) => `${a.symbol} ${a.direction} ${a.target}`).join(' · ');
      }

      case 'deletePriceAlert': {
        const symbol = String(args.symbol ?? '').trim().toUpperCase();
        if (!symbol) return 'which symbol?';
        const snap = await db.collection(`users/${uid}/priceAlerts`).get();
        const active = snap.docs.filter((d) => !(d.data() as { firedAt?: string | null }).firedAt);

        if (symbol === 'ALL') {
          if (!active.length) return 'no active alerts to clear';
          for (const d of active) await db.doc(`users/${uid}/priceAlerts/${d.id}`).delete();
          return `cleared ${active.length} alert${active.length === 1 ? '' : 's'}`;
        }

        const hit = active.find((d) => (d.data() as { symbol?: string }).symbol === symbol);
        if (!hit) return `no active alert for "${symbol}"`;
        await db.doc(`users/${uid}/priceAlerts/${hit.id}`).delete();
        return `cancelled alert for ${symbol}`;
      }

      default:
        return `unknown tool: ${call.tool}`;
    }
  } catch (err) {
    return `${call.tool} failed: ${(err as Error).message}`;
  }
}
