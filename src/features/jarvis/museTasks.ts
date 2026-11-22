/**
 * Two brains: Gemini (Jarvis) answers everything, and Muse, the owner's
 * personal agent, also gets a copy of anything that is a TASK, which it
 * picks up from users/{uid}/coach-inbox and does on its own side.
 *
 * This decides what counts as a task. Shared by the in-app Jarvis and the
 * Telegram bot so both classify the same way. Deliberately plain rules, not
 * a model call: instant, free, and predictable about what gets copied.
 *
 * A task is: setting a reminder, research or a lookup, "remember / note
 * this", or an explicit "send it to Muse". Everything else is chat.
 */

export type MuseTaskKind = 'reminder' | 'research' | 'note' | 'explicit';

/** Optional lead-in before an imperative: "hey Jarvis, can you please ...". */
const LEAD = String.raw`^(?:(?:hey|ok|okay|yo)\s+)?(?:jarvis|muse)?[,!.:]?\s*(?:(?:can|could|would|will)\s+you\s+|please\s+|pls\s+|i\s+need\s+you\s+to\s+|i\s+want\s+you\s+to\s+)*`;

const RULES: { kind: MuseTaskKind; re: RegExp; unless?: RegExp }[] = [
  // "send / give / pass this to Muse", "for Muse"
  { kind: 'explicit', re: /\b(?:send|give|pass|forward|hand|tell)\b[^.?!]{0,30}\bmuse\b|\b(?:to|for)\s+muse\b|^muse\b[,:]/i },
  // "remind me", "set a reminder", "reminder to", "don't let me forget"
  {
    kind: 'reminder',
    re: /\bremind\s+(?:me|us)\b|\b(?:set|add|create|make|put)\s+(?:up\s+)?(?:an?\s+|another\s+)?(?:reminder|alarm)\b|\breminder\s+(?:to|for|at|about)\b|\bdon'?t\s+let\s+me\s+forget\b/i,
  },
  // "research X", "find out", "look up / into", "dig into"
  { kind: 'research', re: /\bresearch\b|\bfind\s+out\b|\blook\s+(?:up|into)\b|\blookup\b|\bdig\s+into\b/i, unless: /\b(?:i|we)\s+(?:will|'ll|already|just)\s+(?:research|look|find)\b/i },
  // "check ..." / "search for ..." only as an instruction, so "I'll check later" stays chat
  { kind: 'research', re: new RegExp(`${LEAD}(?:check|search\\s+for|google|verify)\\b`, 'i') },
  // "remember this / that", "note that", "make a note", "jot down"
  {
    kind: 'note',
    re: new RegExp(
      `${LEAD}remember\\b|\\bremember\\s+(?:this|that|to)\\b|\\b(?:make|take|add)\\s+a\\s+note\\b|\\bnote\\s+(?:this|that|down|it)\\b|^note\\s*[:,-]|\\bjot\\s+(?:this|that|it)?\\s*down\\b|\\bwrite\\s+(?:this|that|it)\\s+down\\b`,
      'i',
    ),
    unless: /\b(?:do|did|don'?t|can'?t|cannot|you|i)\s+(?:you\s+)?remember\b(?!\s+(?:this|that|to)\b)|\bdo\s+you\s+remember\b/i,
  },
];

/** A short follow-up that only makes sense next to the previous message: "set another one", "do it again". */
const FOLLOW_UP_RE = /\b(?:anoth\w*|again|one\s+more|same|also|too|as\s+well|that\s+one|it\s+too)\b/i;
const FOLLOW_UP_MAX_WORDS = 12;

function classifyOne(t: string): MuseTaskKind | null {
  for (const rule of RULES) {
    if (rule.re.test(t) && !(rule.unless && rule.unless.test(t))) return rule.kind;
  }
  return null;
}

/**
 * The kind of task this message is for Muse, or null when it's ordinary chat.
 * Pass the user's previous message too: a short follow-up to a task ("set
 * another one" right after "remind me at 1") is the same kind of task.
 */
export function classifyMuseTask(text: string, previousUserText?: string): MuseTaskKind | null {
  const t = text.trim();
  if (!t) return null;
  const direct = classifyOne(t);
  if (direct) return direct;
  const prev = previousUserText?.trim();
  if (prev && FOLLOW_UP_RE.test(t) && t.split(/\s+/).length <= FOLLOW_UP_MAX_WORDS) return classifyOne(prev);
  return null;
}

/**
 * The tool Gemini can call to hand Muse a task the rules above missed (an
 * odd phrasing, a follow-up). Same shape on every surface.
 */
export const SEND_TO_MUSE_TOOL = {
  name: 'send_to_muse',
  module: 'Muse',
  description:
    "Hand a task to Muse, the user's personal agent, which does it on its own side. Call this when the user asks to set or repeat a reminder, research or look something up, remember or note something, or says to give it to Muse, including follow-ups like 'set another one'. Muse does the task, so do not also call another tool for the same thing. Reply in one short sentence.",
  parameters: { task: 'the complete task in plain words, filling in details from earlier in the conversation (e.g. "remind me at 1:30 AM to set an alarm")' },
};

/** Said first in the reply when a task was copied to Muse. */
export const MUSE_ACK = 'Sent to Muse.';
/** Said first when the copy to Muse failed, so the user knows to resend. */
export const MUSE_ACK_FAILED = "Couldn't send this to Muse, so it only reached me.";

/**
 * Put in Jarvis's context for a mirrored message, so Gemini replies briefly
 * and doesn't also do the task itself (no duplicate reminder from both).
 */
export function museContextNote(kind: MuseTaskKind): string {
  return `This message is a ${kind} task and has been sent to Muse, the user's personal agent, which will do it. Reply in one short sentence; do not call a tool to do the same task yourself, and do not say you sent it (the app already says so).`;
}

/** Prefixes the acknowledgment to a reply without doubling it. */
export function withMuseAck(reply: string, sent: boolean): string {
  const ack = sent ? MUSE_ACK : MUSE_ACK_FAILED;
  const body = reply.trim();
  return body ? `${ack} ${body}` : ack;
}
