import { to12h } from '../../lib/time';
import type { Lesson, Weekday } from './types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The soonest lesson from now, today or later in the week; null once the week's over. */
export function nextLesson(lessons: Lesson[]): { lesson: Lesson; label: string } | null {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay() as Weekday;

  const todayLater = lessons
    .filter((l) => l.day === today && toMinutes(l.start) > nowMin)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (todayLater) return { lesson: todayLater, label: `Today at ${to12h(todayLater.start)}` };

  for (let offset = 1; offset <= 7; offset++) {
    const day = ((today + offset) % 7) as Weekday;
    const candidate = lessons.filter((l) => l.day === day).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (candidate) {
      const dayLabel = offset === 1 ? 'Tomorrow' : DAY_NAMES[day];
      return { lesson: candidate, label: `${dayLabel} at ${to12h(candidate.start)}` };
    }
  }
  return null;
}
