/**
 * One-time import of the old fixed ritual list into Arena habits.
 *
 * The rituals were a hardcoded array everyone shared; Arena habits are the
 * user's own, editable, and feed the puzzle. This carries the eleven across
 * once so nobody loses their routine in the switch, then records a flag so it
 * never runs again — re-running it would resurrect habits the user has since
 * deleted on purpose.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { RITUALS } from '../../../constants';
import { addHabit, listHabits } from './habits';

const FLAG = (uid: string) => doc(db, `users/${uid}/arenaMeta/migration`);

/** Icons roughly matched from the ritual name, same idea as habit-arena's. */
function iconFor(name: string): string {
  const n = name.toLowerCase();
  if (/wake|morning|sun/.test(n)) return 'sunrise';
  if (/meditat|breath/.test(n)) return 'brain';
  if (/shower|cold/.test(n)) return 'droplets';
  if (/read|book/.test(n)) return 'book-open';
  if (/work|deep|focus/.test(n)) return 'target';
  if (/vitamin|med|pill/.test(n)) return 'pill';
  if (/detox|digital|phone/.test(n)) return 'smartphone';
  if (/skin|care/.test(n)) return 'sparkles';
  if (/journal|grateful/.test(n)) return 'notebook-pen';
  if (/sleep|bed/.test(n)) return 'moon';
  if (/plan|review/.test(n)) return 'list-checks';
  return 'check';
}

/** A colour per ritual category, so the imported set still reads as a routine. */
const CATEGORY_COLOR: Record<string, string> = {
  morning: '#f59e0b',
  growth: '#10b981',
  evening: '#6366f1',
};

/**
 * Import the rituals once. Returns how many were created.
 *
 * Safe to call on every load: it no-ops if the flag is set, and also if the
 * user already has habits — someone who set Arena up by hand shouldn't get
 * eleven surprise extras on top.
 */
export async function migrateRitualsOnce(uid: string): Promise<number> {
  const flag = await getDoc(FLAG(uid));
  if (flag.exists()) return 0;

  const existing = await listHabits(uid);
  if (existing.length > 0) {
    // Nothing to do, but record it so we stop checking.
    await setDoc(FLAG(uid), { ritualsImported: 0, at: new Date().toISOString(), skipped: 'had habits' });
    return 0;
  }

  // Start counting today rather than tomorrow: these are habits the user was
  // already keeping, so the first day shouldn't read as a miss.
  const startsAt = new Date().toISOString().slice(0, 10);
  for (const r of RITUALS) {
    await addHabit(uid, {
      label: r.name,
      kind: 'good',
      icon: iconFor(r.name),
      color: CATEGORY_COLOR[r.category] ?? '#10b981',
      startsAt,
    });
  }

  await setDoc(FLAG(uid), { ritualsImported: RITUALS.length, at: new Date().toISOString() });
  return RITUALS.length;
}
