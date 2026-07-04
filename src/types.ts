export interface Ritual {
  id: string;
  name: string;
  category: 'morning' | 'growth' | 'evening';
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
}

export interface Idea {
  id: string;
  title: string;
  desc: string;
  timestamp: string;
}

export interface VisionItem {
  id: string;
  url: string;
  title: string;
  createdAt: string;
}

export interface PrimaryObjective {
  text: string;
  done: boolean;
}

export interface OSState {
  lastVisit: string;
  water: number;
  rituals: Record<string, boolean>;
  tasks: Task[];
  ideas: Idea[];
  visionBoard: VisionItem[];
  weight?: number;
  /** Consecutive days with activity; maintained by useStreak. */
  streak?: number;
  /** YYYY-MM-DD the streak was last credited. */
  streakDate?: string;
  primaryObjective?: PrimaryObjective;
  points?: number;
  /**
   * Per-user module enable/disable state, keyed by FeatureId (see
   * features/registry.ts). Absent keys fall back to each module's default.
   */
  features?: Record<string, boolean>;
  /** Per-user Jarvis behaviour preferences (persisted in users/{uid}). */
  jarvisPrefs?: {
    /** Jarvis greets proactively on login (default true). */
    greetOnLogin?: boolean;
  };
  physioState?: {
    back: number;
    tailbone: number;
    knees: number;
    foot: number;
    neck: number;
  };
  /** Stocks & Finance module (manual entries; live quotes come from /api/stocks). */
  finance?: FinanceState;
}

export interface Holding {
  id: string;
  /** Yahoo Finance symbol, e.g. RELIANCE.NS, TCS.BO, AAPL. */
  symbol: string;
  qty: number;
  /** Average cost per unit, in the instrument's own currency. */
  avgCost: number;
}

export interface WatchItem {
  id: string;
  symbol: string;
  /** Optional alert thresholds (same currency as the quote). */
  alertAbove?: number;
  alertBelow?: number;
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
  category?: string;
  /** ISO timestamp — budget math groups by calendar month. */
  at: string;
}

export interface NetWorthItem {
  id: string;
  label: string;
  amount: number;
  type: 'asset' | 'liability';
}

export interface FinanceState {
  holdings: Holding[];
  watchlist: WatchItem[];
  /** Monthly spending cap for the budget tracker (optional). */
  monthlyBudget?: number;
  expenses: Expense[];
  netWorthItems: NetWorthItem[];
}

export const EMPTY_FINANCE: FinanceState = { holdings: [], watchlist: [], expenses: [], netWorthItems: [] };
