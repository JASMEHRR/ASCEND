import { RITUALS } from '../../../constants';
import type { OSState } from '../../../types';
import type { JarvisTool } from '../types';
import { VIEW_LABELS, type View } from '../context/appContext';

const fuzzy = (a: string, b: string) =>
  a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

interface Deps {
  stateRef: { current: OSState };
  updateState: (updater: (prev: OSState) => OSState) => void;
  setView: (v: View) => void;
}

/** Built-in tools for the core life-OS modules (nav, health, tasks, rituals, ideas). */
export function createAppTools({ stateRef, updateState, setView }: Deps): JarvisTool[] {
  return [
    {
      name: 'navigate',
      module: 'Navigation',
      description: 'Switch the app to another page/module.',
      parameters: { view: 'one of: dashboard, physio, business, review, vision, buy_list' },
      validate: (a) => (str(a.view) in VIEW_LABELS ? null : `unknown page "${str(a.view)}"`),
      execute: (a) => {
        const target = str(a.view) as View;
        setView(target);
        return { ok: true, message: `opened ${VIEW_LABELS[target]}` };
      },
    },
    {
      name: 'logWater',
      module: 'Health',
      description: "Add glasses of water to today's hydration.",
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
      validate: (a) => (num(a.steps, -1) >= 0 ? null : 'steps must be a number'),
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
      validate: (a) => (num(a.kg) > 0 ? null : 'need a valid weight in kg'),
      execute: (a) => {
        const kg = num(a.kg);
        updateState((p) => ({ ...p, weight: kg }));
        return { ok: true, message: `weight → ${kg}kg` };
      },
    },
    {
      name: 'createTask',
      module: 'Tasks',
      description: 'Add a task to the daily task list.',
      parameters: { text: 'the task description' },
      validate: (a) => (str(a.text) ? null : 'task text is required'),
      execute: (a) => {
        const text = str(a.text);
        updateState((p) => ({ ...p, tasks: [...p.tasks, { id: crypto.randomUUID(), text, done: false }] }));
        return { ok: true, message: `task added: ${text}` };
      },
    },
    {
      name: 'completeTask',
      module: 'Tasks',
      description: 'Mark a matching open task as done.',
      parameters: { match: 'words from the task text to match' },
      validate: (a) => (str(a.match) ? null : 'need text to match'),
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
    {
      name: 'toggleRitual',
      module: 'Rituals',
      description: 'Toggle a daily ritual (e.g. meditation, cold shower) done/undone.',
      parameters: { match: 'words from the ritual name' },
      validate: (a) => (str(a.match) ? null : 'need a ritual name to match'),
      execute: (a) => {
        const ritual = RITUALS.find((r) => fuzzy(r.name, str(a.match)));
        if (!ritual) return { ok: false, message: `no ritual matches "${str(a.match)}"` };
        updateState((p) => ({ ...p, rituals: { ...p.rituals, [ritual.id]: !p.rituals[ritual.id] } }));
        return { ok: true, message: `ritual: ${ritual.name}` };
      },
    },
    {
      name: 'setPrimaryObjective',
      module: 'Dashboard',
      description: "Set today's single most important objective.",
      parameters: { text: 'the objective' },
      validate: (a) => (str(a.text) ? null : 'objective text is required'),
      execute: (a) => {
        updateState((p) => ({ ...p, primaryObjective: { text: str(a.text), done: false } }));
        return { ok: true, message: 'objective set' };
      },
    },
    {
      name: 'addIdea',
      module: 'Strategic Command',
      description: 'Capture a business idea in the Ideas inbox.',
      parameters: { title: 'idea title', desc: 'optional short description' },
      validate: (a) => (str(a.title) ? null : 'idea title is required'),
      execute: (a) => {
        updateState((p) => ({
          ...p,
          ideas: [...p.ideas, { id: crypto.randomUUID(), title: str(a.title), desc: str(a.desc), timestamp: new Date().toISOString() }],
        }));
        return { ok: true, message: `idea captured: ${str(a.title)}` };
      },
    },
  ];
}
