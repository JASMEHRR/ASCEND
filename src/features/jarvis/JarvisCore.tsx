import { useEffect, useRef } from 'react';
import type { OSState } from '../../types';
import { RITUALS } from '../../constants';
import { useJarvis } from './JarvisContext';
import { useLaunchStateContext } from '../launch/LaunchStateContext';
import { useAuth } from '../../context/AuthContext';
import { launchApi } from '../launch/launchApi';
import type { JarvisTool } from './types';
import type { LaunchState } from '../launch/types';

export type View = 'dashboard' | 'physio' | 'business' | 'review' | 'vision' | 'buy_list';

const VIEW_LABELS: Record<View, string> = {
  dashboard: 'Dashboard',
  physio: 'AI Physio',
  business: 'Strategic Command',
  review: 'Weekly Review',
  vision: 'Vision Board',
  buy_list: 'Purchases',
};

const fuzzy = (a: string, b: string) =>
  a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  view: View;
  setView: (v: View) => void;
}

/**
 * Registers ASCEND's built-in Jarvis tools and the live context snapshot.
 * Renders nothing. New modules add their own registrar the same way — the
 * Jarvis engine never needs to change.
 */
export default function JarvisCore({ state, updateState, view, setView }: Props) {
  const { registerTools, registerContext } = useJarvis();
  const { user } = useAuth();
  const { state: launch, update: updateLaunch } = useLaunchStateContext();

  // Refs so tool/context closures can be registered once yet always read fresh data.
  const stateRef = useRef<OSState>(state);
  stateRef.current = state;
  const launchRef = useRef<LaunchState | null>(launch);
  launchRef.current = launch;
  const viewRef = useRef<View>(view);
  viewRef.current = view;
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  const userEmailRef = useRef<string | null>(user?.email ?? null);
  userEmailRef.current = user?.email ?? null;

  // --- Live context contributor ---
  useEffect(() => {
    return registerContext('core', () => {
      const s = stateRef.current;
      const l = launchRef.current;
      const ritualsDone = Object.entries(s.rituals).filter(([, v]) => v).map(([id]) => RITUALS.find((r) => r.id === id)?.name ?? id);
      return {
        page: VIEW_LABELS[viewRef.current],
        user: userEmailRef.current,
        today: new Date().toDateString(),
        health: { water: s.water, steps: s.steps, weight: s.weight ?? null, points: s.points ?? 0 },
        rituals: { done: ritualsDone, available: RITUALS.map((r) => r.name) },
        tasks: s.tasks.map((t) => ({ text: t.text, done: t.done })),
        primaryObjective: s.primaryObjective ?? null,
        ideas: s.ideas.map((i) => i.title),
        pain: s.physioState ?? null,
        strategicCommand: l
          ? {
              activeOffer: l.activeOffer?.title ?? null,
              pipeline: l.prospects.length,
              planTasksDone: l.planDone.length,
            }
          : null,
      };
    });
  }, [registerContext]);

  // --- Tools ---
  useEffect(() => {
    const tools: JarvisTool[] = [
      // Navigation
      {
        name: 'navigate',
        module: 'Navigation',
        description: 'Switch the app to another page/module.',
        parameters: { view: 'one of: dashboard, physio, business, review, vision, buy_list' },
        execute: (a) => {
          const target = str(a.view) as View;
          if (!(target in VIEW_LABELS)) return { ok: false, message: `Unknown page "${target}"` };
          setViewRef.current(target);
          return { ok: true, message: `opened ${VIEW_LABELS[target]}` };
        },
      },
      // Health
      {
        name: 'logWater',
        module: 'Health',
        description: 'Add glasses of water to today\'s hydration.',
        parameters: { glasses: 'number of glasses to add (default 1)' },
        execute: (a) => {
          const add = Math.max(0, Math.round(num(a.glasses, 1)));
          updateState((p) => ({ ...p, water: Math.max(0, p.water + add) }));
          return { ok: true, message: `+${add} glass${add === 1 ? '' : 'es'} water` };
        },
      },
      {
        name: 'logSteps',
        module: 'Health',
        description: "Set today's total step count.",
        parameters: { steps: 'total steps for today' },
        execute: (a) => {
          const s = Math.max(0, Math.round(num(a.steps)));
          updateState((p) => ({ ...p, steps: s }));
          return { ok: true, message: `steps → ${s.toLocaleString()}` };
        },
      },
      {
        name: 'logWeight',
        module: 'Health',
        description: 'Record the latest body weight in kilograms.',
        parameters: { kg: 'weight in kilograms' },
        execute: (a) => {
          const kg = num(a.kg);
          if (kg <= 0) return { ok: false, message: 'need a valid weight' };
          updateState((p) => ({ ...p, weight: kg }));
          return { ok: true, message: `weight → ${kg}kg` };
        },
      },
      // Tasks
      {
        name: 'createTask',
        module: 'Tasks',
        description: 'Add a task to the daily task list.',
        parameters: { text: 'the task description' },
        execute: (a) => {
          const text = str(a.text);
          if (!text) return { ok: false, message: 'empty task' };
          updateState((p) => ({ ...p, tasks: [...p.tasks, { id: crypto.randomUUID(), text, done: false }] }));
          return { ok: true, message: 'task added' };
        },
      },
      {
        name: 'completeTask',
        module: 'Tasks',
        description: 'Mark a matching task as done.',
        parameters: { match: 'words from the task text to match' },
        execute: (a) => {
          const match = str(a.match);
          const hit = stateRef.current.tasks.find((t) => !t.done && fuzzy(t.text, match));
          if (!hit) return { ok: false, message: `no open task matches "${match}"` };
          updateState((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === hit.id ? { ...t, done: true } : t)) }));
          return { ok: true, message: `completed: ${hit.text}` };
        },
      },
      {
        name: 'listTasks',
        module: 'Tasks',
        description: "Read the user's current tasks and their done state.",
        followUp: true,
        execute: () => ({ ok: true, message: 'read tasks', data: stateRef.current.tasks.map((t) => ({ text: t.text, done: t.done })) }),
      },
      // Rituals
      {
        name: 'toggleRitual',
        module: 'Rituals',
        description: 'Toggle a daily ritual (e.g. meditation, cold shower) done/undone.',
        parameters: { match: 'words from the ritual name' },
        execute: (a) => {
          const match = str(a.match);
          const ritual = RITUALS.find((r) => fuzzy(r.name, match));
          if (!ritual) return { ok: false, message: `no ritual matches "${match}"` };
          updateState((p) => ({ ...p, rituals: { ...p.rituals, [ritual.id]: !p.rituals[ritual.id] } }));
          return { ok: true, message: `ritual: ${ritual.name}` };
        },
      },
      // Objective
      {
        name: 'setPrimaryObjective',
        module: 'Dashboard',
        description: "Set today's single most important objective.",
        parameters: { text: 'the objective' },
        execute: (a) => {
          const text = str(a.text);
          if (!text) return { ok: false, message: 'empty objective' };
          updateState((p) => ({ ...p, primaryObjective: { text, done: false } }));
          return { ok: true, message: 'objective set' };
        },
      },
      // Ideas
      {
        name: 'addIdea',
        module: 'Strategic Command',
        description: 'Capture a business idea in the Ideas inbox.',
        parameters: { title: 'idea title', desc: 'optional short description' },
        execute: (a) => {
          const title = str(a.title);
          if (!title) return { ok: false, message: 'empty idea' };
          updateState((p) => ({ ...p, ideas: [...p.ideas, { id: crypto.randomUUID(), title, desc: str(a.desc), timestamp: new Date().toISOString() }] }));
          return { ok: true, message: 'idea captured' };
        },
      },
      // Strategic Command — AI generators
      {
        name: 'validateIdea',
        module: 'Strategic Command',
        description: 'Score a business idea on the Opportunity Matrix (demand × competition).',
        parameters: { idea: 'the business idea to score' },
        followUp: true,
        execute: async (a) => {
          const idea = str(a.idea);
          if (!idea) return { ok: false, message: 'no idea provided' };
          const r = await launchApi.scoreIdea(idea);
          updateLaunch((prev) => ({
            ...prev,
            matrixHistory: [{ ...r, id: crypto.randomUUID(), idea, createdAt: new Date().toISOString() }, ...prev.matrixHistory].slice(0, 25),
          }));
          return { ok: true, message: `scored: ${r.quadrant.replace('_', ' ')}`, data: { quadrant: r.quadrant, demand: r.demand, competition: r.competition, recommendation: r.recommendation } };
        },
      },
      {
        name: 'generateOffer',
        module: 'Strategic Command',
        description: 'Generate a full business offer from the user\'s skills and set it active.',
        parameters: { skills: 'skills', knowledge: 'domain knowledge', experience: 'experience', interests: 'interests' },
        followUp: true,
        execute: async (a) => {
          const answers = { skills: str(a.skills), knowledge: str(a.knowledge), experience: str(a.experience), interests: str(a.interests) };
          if (!answers.skills && !answers.knowledge && !answers.experience && !answers.interests) {
            return { ok: false, message: 'need at least one input (skills/knowledge/experience/interests)' };
          }
          const offer = await launchApi.generateOffer(answers);
          updateLaunch((prev) => ({ ...prev, activeOffer: offer }));
          return { ok: true, message: `offer: ${offer.title}`, data: { title: offer.title, whatYouSell: offer.whatYouSell, whoYouSellTo: offer.whoYouSellTo } };
        },
      },
      {
        name: 'generateProspects',
        module: 'Strategic Command',
        description: 'Build a targeted prospect list for the active offer and add it to the pipeline.',
        followUp: true,
        execute: async () => {
          const offer = launchRef.current?.activeOffer;
          if (!offer) return { ok: false, message: 'no active offer — generate one first' };
          const list = await launchApi.buildProspects(offer);
          const now = new Date().toISOString();
          const saved = list.prospects.map((p) => ({ ...p, id: crypto.randomUUID(), status: 'new' as const, createdAt: now }));
          updateLaunch((prev) => ({ ...prev, prospects: [...prev.prospects, ...saved] }));
          return { ok: true, message: `${saved.length} prospects added`, data: { count: saved.length, researchNotes: list.researchNotes } };
        },
      },
    ];

    return registerTools('core', tools);
  }, [registerTools, updateState, updateLaunch]);

  return null;
}
