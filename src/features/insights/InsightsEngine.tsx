import { useEffect, useRef } from 'react';
import type { OSState } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import { disciplineScore } from '../../lib/discipline';

interface Deps {
  state: OSState;
}

export const DEFAULT_ACTIVE_HOURS = { start: 8, end: 22 };

interface Insight {
  /** Stable id — each fires at most once per day. */
  id: string;
  message: string;
  /** Earliest local hour this insight makes sense. */
  notBefore?: number;
}

/** Rule-based nudges derived from live state. Cheap, private, no LLM call. */
function deriveInsights(s: OSState): Insight[] {
  const out: Insight[] = [];
  const h = new Date().getHours();
  const open = s.tasks.filter((t) => !t.done).length;

  if (h >= 14 && s.water < 4) {
    out.push({ id: 'hydration', message: `Hydration is lagging — only ${s.water} glass${s.water === 1 ? '' : 'es'} so far today. Worth a refill.` });
  }
  if (h >= 10 && !s.primaryObjective) {
    out.push({ id: 'no-focus', message: 'No primary objective set today. One clear focus beats ten open loops — tell me what matters most.' });
  }
  if (open >= 6) {
    out.push({ id: 'task-pileup', message: `${open} tasks are open. Want me to help triage the list down to what actually matters?` });
  }
  if (h >= 19 && disciplineScore(s) < 40) {
    out.push({ id: 'streak-risk', message: `Discipline is at ${disciplineScore(s)}/100 with the evening closing in — a couple of rituals would rescue the day.` });
  }
  const month = new Date().toISOString().slice(0, 7);
  const spent = (s.finance?.expenses ?? []).filter((e) => e.at.slice(0, 7) === month).reduce((sum, e) => sum + e.amount, 0);
  if (s.finance?.monthlyBudget && spent > s.finance.monthlyBudget) {
    out.push({ id: 'budget-blown', message: `You're over this month's budget (${Math.round((spent / s.finance.monthlyBudget) * 100)}% spent). Maybe ease off the discretionary stuff.` });
  }
  return out;
}

/** Minimum gap between any two delivered insights. */
const GLOBAL_COOLDOWN_MS = 45 * 60 * 1000;

/**
 * Proactive Insights: active-hours-gated nudges delivered via toast + voice.
 * Each rule fires at most once per day; at most one insight per 45 minutes;
 * silent outside the user's active hours. Renders nothing.
 */
export default function InsightsEngine({ state }: Deps) {
  const { user } = useAuth();
  const { show } = useToast();
  const { voice } = useJarvis();

  const stateRef = useRef(state);
  stateRef.current = state;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const showRef = useRef(show);
  showRef.current = show;

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    const dayKey = () => `ascend_insights_${uid}_${new Date().toISOString().slice(0, 10)}`;
    const lastKey = `ascend_insights_last_${uid}`;

    const tick = () => {
      const s = stateRef.current;
      const hours = s.jarvisPrefs?.activeHours ?? DEFAULT_ACTIVE_HOURS;
      const h = new Date().getHours();
      // Active-hours gate (supports overnight ranges like 22 → 6).
      const inWindow = hours.start <= hours.end ? h >= hours.start && h < hours.end : h >= hours.start || h < hours.end;
      if (!inWindow) return;

      let last = 0;
      let deliveredToday: string[] = [];
      try {
        last = Number(localStorage.getItem(lastKey) ?? 0);
        deliveredToday = JSON.parse(localStorage.getItem(dayKey()) ?? '[]');
      } catch {
        /* corrupt cache — treat as fresh */
      }
      if (Date.now() - last < GLOBAL_COOLDOWN_MS) return;

      const next = deriveInsights(s).find((i) => !deliveredToday.includes(i.id));
      if (!next) return;

      try {
        localStorage.setItem(lastKey, String(Date.now()));
        localStorage.setItem(dayKey(), JSON.stringify([...deliveredToday, next.id]));
      } catch {
        /* private mode */
      }
      showRef.current({ kind: 'insight', title: 'Jarvis', message: next.message });
      voiceRef.current.speak(next.message);
    };

    // First check shortly after login (after the greeting settles), then every 10 min.
    const first = setTimeout(tick, 20_000);
    const interval = setInterval(tick, 10 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [user?.uid]);

  return null;
}
