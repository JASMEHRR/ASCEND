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

/** A user-supplied background image, picked from Settings → Sanctuary. */
export interface CustomBackground {
  id: string;
  /** Image URL — pasted link or a compressed data URL upload. */
  url: string;
  /** Short label shown in the picker, e.g. "My photo". */
  label: string;
  createdAt: string;
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
  wishes?: number;
  /** Whether the wish counter shows on the dashboard. Defaults to on. */
  showWishes?: boolean;
  /**
   * Per-user module enable/disable state, keyed by FeatureId (see
   * features/registry.ts). Absent keys fall back to each module's default.
   */
  features?: Record<string, boolean>;
  /**
   * Glass opacity multiplier (0.2–1) driving the `--glass-opacity` CSS
   * variable. Lower = more see-through UI. Defaults to 1.
   */
  glassOpacity?: number;
  /** Backdrop blur radius in px behind glass surfaces (0–40). Defaults to 20. */
  glassBlur?: number;
  /**
   * Sidebar nav order (FeatureIds) and hidden entries, both user-editable in
   * Settings → Modules. Absent = registry order, nothing hidden.
   */
  navOrder?: string[];
  navHidden?: string[];
  /**
   * Whether the first-run setup has been completed. Absent/false shows the
   * setup wizard; Settings can reset it to run through the steps again.
   */
  setupComplete?: boolean;
  /** What Jarvis calls you. Falls back to the email's local part when unset. */
  displayName?: string;
  /** Per-user Jarvis behaviour preferences (persisted in users/{uid}). */
  jarvisPrefs?: {
    /** Jarvis greets proactively on login (default true). */
    greetOnLogin?: boolean;
    /** Local hours [start, end) when proactive insights may speak (default 8–22). */
    activeHours?: { start: number; end: number };
  };
  /**
   * Sanctuary atmosphere: 'auto' follows time-of-day, a built-in preset id,
   * or a custom background's id (see customBackgrounds). Set in Settings.
   */
  atmosphereMode?: string;
  /**
   * User-added background images, managed in Settings → Sanctuary. Each gets
   * its own id so atmosphereMode can point at one without touching the
   * built-in ATMOSPHERES presets.
   */
  customBackgrounds?: CustomBackground[];
  /** Stocks & Finance module (manual entries; live quotes come from /api/stocks). */
  finance?: FinanceState;
  /**
   * Journaling & Reflection. A capped recent-entries cache lives here (so the
   * journal works offline / without Obsidian); entries also append to the
   * user's Obsidian vault (Journal/YYYY-MM-DD.md) when connected.
   */
  journal?: { entries: JournalEntry[] };
}

export interface JournalEntry {
  id: string;
  text: string;
  at: string;
  mode: 'text' | 'voice';
  /** Whether the entry also landed in the Obsidian vault. */
  inVault: boolean;
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
