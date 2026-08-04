/**
 * Custom modules: user-defined widgets, assembled from a fixed set of safe
 * building blocks rather than generated code. Jarvis (or the user directly)
 * can create one from a chat request — since nothing is compiled or deployed,
 * it appears instantly and can never break the app for anyone else.
 */

/** The only shapes a custom module can take. Anything else is rejected. */
export type CustomModuleKind = 'tracker' | 'list' | 'counter' | 'chart';

export interface CustomModule {
  id: string;
  title: string;
  kind: CustomModuleKind;
  /** Lucide icon name; falls back to a generic icon per kind if unrecognized. */
  icon?: string;
  createdAt: string;
  /** Kind-specific configuration. */
  config: TrackerConfig | ListConfig | CounterConfig | ChartConfig;
}

/** tracker: a daily yes/no or numeric target, like a habit. */
export interface TrackerConfig {
  target?: number;
  unit?: string;
}

/** list: freeform items with a done flag, like a simple checklist. */
export interface ListConfig {
  placeholder?: string;
}

/** counter: a running number the user increments/decrements, no daily reset. */
export interface CounterConfig {
  step?: number;
  startAt?: number;
}

/** chart: a numeric value logged over time, rendered as a simple line/bar. */
export interface ChartConfig {
  unit?: string;
}

/**
 * One generic entry. Every kind reuses this same shape so a single data layer
 * and Firestore subcollection serves all four — `value`/`label`/`done` are
 * each interpreted differently depending on the module's kind.
 */
export interface CustomEntry {
  id: string;
  /** tracker/counter/chart: the logged number. list: unused. */
  value?: number;
  /** list: the item text. tracker/chart: an optional note. */
  label?: string;
  /** list: whether this item is checked off. */
  done?: boolean;
  at: string;
}
