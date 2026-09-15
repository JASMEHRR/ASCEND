/**
 * What a habit looks like when it's created without anyone choosing.
 *
 * Both creation paths — the Settings form and the assistant's addArenaHabit
 * tool — used to hardcode a green 'check' with no slot, so every habit added
 * after the board was set up arrived generic and unplaced. They share this
 * instead, which keeps the form and the assistant from drifting apart.
 *
 * Kept out of logic/slots.ts on purpose: this reaches the icon table, which
 * pulls in lucide, and the pure logic modules stay dependency-free so they
 * keep running under plain node in the test suite.
 */
import { iconNameFor } from './icons';
import { slotFor, slotMeta } from './logic/slots';
import type { HabitSlot } from './logic/types';

export interface HabitDefaults {
  icon: string;
  color: string;
  slot: HabitSlot;
}

export function habitDefaults(label: string): HabitDefaults {
  const slot = slotFor(label);
  return { icon: iconNameFor(label), color: slotMeta(slot).color, slot };
}
