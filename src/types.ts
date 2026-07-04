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
  physioState?: {
    back: number;
    tailbone: number;
    knees: number;
    foot: number;
    neck: number;
  };
}
