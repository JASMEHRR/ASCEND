export interface Ritual {
  id: string;
  name: string;
  category: 'morning' | 'growth' | 'evening';
}

export interface Exercise {
  id: string;
  name: string;
  meta: string;
  type: 'back' | 'trek';
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

export interface MentalState {
  energy: number;
  focus: number;
  stress: number;
}

export interface OSState {
  lastVisit: string;
  water: number;
  rituals: Record<string, boolean>;
  exerciseAM: Record<string, boolean>;
  exercisePM: Record<string, boolean>;
  customAM?: string[];
  customPM?: string[];
  tasks: Task[];
  ideas: Idea[];
  visionBoard: VisionItem[];
  steps: number;
  isFitConnected: boolean;
  fitLastSync?: string;
  fitStatus?: string;
  primaryObjective?: PrimaryObjective;
  founderMode?: boolean;
  mentalState?: MentalState;
  ascendScore?: number;
  points?: number;
  physioState?: {
    back: number;
    tailbone: number;
    knees: number;
    foot: number;
    neck: number;
  };
}
