/**
 * Grouping the day into slots.
 *
 * Scoring is deliberately untouched by any of this: every habit is still worth
 * exactly one tile wherever it sits. Slots only decide reading order, because
 * the difference between a list you work through and a list you avoid is
 * whether it runs in the order your day actually happens.
 */
import type { Habit, HabitSlot } from './types';

export interface SlotMeta {
  id: HabitSlot;
  label: string;
  /** Shown beside the heading — what this stretch of the day is for. */
  hint: string;
  color: string;
}

/** Declaration order is display order. */
export const SLOTS: SlotMeta[] = [
  { id: 'morning', label: 'Morning', hint: 'before class', color: '#f59e0b' },
  { id: 'day', label: 'Day', hint: 'class and study', color: '#10b981' },
  { id: 'evening', label: 'Evening', hint: 'wind down', color: '#6366f1' },
  { id: 'control', label: 'Control', hint: 'limits you hold', color: '#f43f5e' },
  { id: 'anytime', label: 'Anytime', hint: 'no fixed time', color: '#64748b' },
];

const RANK = new Map(SLOTS.map((s, i) => [s.id, i]));

export function slotOf(habit: Habit): HabitSlot {
  return habit.slot && RANK.has(habit.slot) ? habit.slot : 'anytime';
}

export function slotMeta(id: HabitSlot): SlotMeta {
  return SLOTS.find((s) => s.id === id) ?? SLOTS[SLOTS.length - 1];
}

/**
 * Slot first, then the author's rank, then creation time. The last tiebreak
 * matters: without it two unranked habits can swap places between renders,
 * and a checklist whose rows move is one you stop trusting.
 */
export function compareHabits(a: Habit, b: Habit): number {
  const ra = RANK.get(slotOf(a)) ?? SLOTS.length;
  const rb = RANK.get(slotOf(b)) ?? SLOTS.length;
  if (ra !== rb) return ra - rb;

  const oa = a.order ?? Number.MAX_SAFE_INTEGER;
  const ob = b.order ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;

  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

/**
 * Guess a slot from the habit's name.
 *
 * Order matters: 'control' is checked first because the limits you hold are
 * phrased around the thing being limited ("No Phone in Bed" names a bed, "No
 * Instagram" names Instagram), so a keyword match on the noun would file them
 * under the wrong part of the day. A guess, not a ruling — the edit form lets
 * it be corrected, and 'anytime' is the honest answer when nothing matches.
 */
const SLOT_HINTS: [RegExp, HabitSlot][] = [
  [/\bno\b|\bover\b|\bunder\b|\blimit|instagram|tiktok|reels|scroll|chess|detox/, 'control'],
  [/wake|morning|sunlight|sunrise|gym|workout|exercise|lift|mobility|stretch|yoga/, 'morning'],
  // \bcall, not call: "Active Recall" is study, not a phone call.
  [/sleep|bed|night|wind.?down|journal|plan|review|reflect|\bcall|connect|family|digital|sunset/, 'evening'],
  [/class|lecture|attend|study|revis|recall|practice|problem|librar|read|build|code|work|step|walk/, 'day'],
];

export function slotFor(label: string): HabitSlot {
  const n = label.toLowerCase();
  for (const [re, slot] of SLOT_HINTS) if (re.test(n)) return slot;
  return 'anytime';
}

export interface HabitGroup {
  slot: SlotMeta;
  habits: Habit[];
}

/** Sorted, non-empty groups in slot order. */
export function groupBySlot(habits: Habit[]): HabitGroup[] {
  const sorted = [...habits].sort(compareHabits);
  const groups: HabitGroup[] = [];
  for (const habit of sorted) {
    const id = slotOf(habit);
    const last = groups[groups.length - 1];
    if (last && last.slot.id === id) last.habits.push(habit);
    else groups.push({ slot: slotMeta(id), habits: [habit] });
  }
  return groups;
}
