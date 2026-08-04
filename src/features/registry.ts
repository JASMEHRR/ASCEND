import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Activity,
  Lightbulb,
  Eye,
  ShoppingCart,
  CalendarClock,
  Sparkles,
  NotebookPen,
  Mail,
  LineChart,
  Puzzle,
  Blocks,
} from 'lucide-react';
import type { OSState } from '../types';

/**
 * The single source of truth for every toggleable module in the OS.
 *
 * Adding a feature = adding one entry here. The sidebar, mobile nav, settings
 * panel, and Jarvis's system awareness all derive from this registry, so new
 * modules slot into the toggle framework without touching those call sites.
 */
export type FeatureId =
  // Existing, shipped modules (each maps to a main-nav view).
  | 'dashboard'
  | 'physio'
  | 'business'
  | 'vision'
  | 'buy_list'
  // v2 flagship modules — registered now, built incrementally.
  | 'planning'
  | 'insights'
  | 'journal'
  | 'gmail'
  | 'stocks'
  | 'arena'
  | 'custom';

export interface FeatureModule {
  id: FeatureId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Core modules are the Jarvis home surface — always on, never toggleable. */
  core?: boolean;
  /** Renders as a primary nav view in the sidebar. */
  nav: boolean;
  /** Also appears in the space-constrained mobile bottom nav. */
  mobile?: boolean;
  /** Enabled for new users before they customise anything. */
  defaultEnabled: boolean;
  /**
   * 'active'     — built and shippable; obeys the user's enable/disable toggle.
   * 'coming-soon'— registered so the framework is pre-wired, but not yet built;
   *                shown locked in Settings and never rendered anywhere.
   */
  status: 'active' | 'coming-soon';
}

export const FEATURES: FeatureModule[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: "Jarvis's home surface — the day at a glance.",
    icon: LayoutDashboard,
    core: true,
    nav: true,
    mobile: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'arena',
    label: 'Arena',
    description: 'Shared habit board — rooms, puzzles, and a live leaderboard.',
    icon: Puzzle,
    nav: true,
    mobile: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'physio',
    label: 'AI Physio',
    description: 'Recovery, mobility, and posture guidance.',
    icon: Activity,
    nav: true,
    mobile: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'business',
    label: 'Strategic Command',
    description: 'Offer, pipeline, and outreach workspace.',
    icon: Lightbulb,
    nav: true,
    mobile: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'vision',
    label: 'Vision Board',
    description: 'Visual goals and aspirations.',
    icon: Eye,
    nav: true,
    mobile: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'buy_list',
    label: 'Purchases',
    description: 'Things to buy and acquisition tasks.',
    icon: ShoppingCart,
    nav: true,
    mobile: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'planning',
    label: 'AI Daily Planning',
    description: 'Jarvis proposes a schedule you approve before anything syncs to Google Calendar.',
    icon: CalendarClock,
    nav: false,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'insights',
    label: 'Proactive Insights',
    description: 'Timely toast + voice nudges during your active hours.',
    icon: Sparkles,
    nav: false,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'journal',
    label: 'Journal',
    description: 'Text or voice journaling that syncs to your Obsidian vault.',
    icon: NotebookPen,
    nav: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Inbox summaries, urgent flags, and reply drafts — it never sends for you.',
    icon: Mail,
    nav: false,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'stocks',
    label: 'Stocks & Finance',
    description: 'Live portfolio & watchlist (Indian + international), budgeting, net worth.',
    icon: LineChart,
    nav: true,
    mobile: true,
    defaultEnabled: true,
    status: 'active',
  },
  {
    id: 'custom',
    label: 'My Modules',
    description: 'Custom trackers, counters, lists, and charts — built by you or by Jarvis on request.',
    icon: Blocks,
    nav: true,
    defaultEnabled: true,
    status: 'active',
  },
];

export const FEATURE_MAP: Record<FeatureId, FeatureModule> = FEATURES.reduce(
  (acc, f) => {
    acc[f.id] = f;
    return acc;
  },
  {} as Record<FeatureId, FeatureModule>,
);

/**
 * Whether a module is active for this user right now.
 *
 * Core modules are always on. Coming-soon modules are always off (not built).
 * Everything else honours the user's stored preference, falling back to the
 * module's default when they haven't chosen.
 */
export function isFeatureEnabled(state: Pick<OSState, 'features'> | null, id: FeatureId): boolean {
  const mod = FEATURE_MAP[id];
  if (!mod) return false;
  if (mod.core) return true;
  if (mod.status !== 'active') return false;
  return state?.features?.[id] ?? mod.defaultEnabled;
}
