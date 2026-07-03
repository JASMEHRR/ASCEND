export interface PricingTier {
  name: string;
  price: number;
  deliverables: string[];
  bestFor: string;
}

export interface Competitor {
  name: string;
  description: string;
  howToDifferentiate: string;
}

export interface PlanDay {
  day: number;
  title: string;
  actions: string[];
}

export interface Offer {
  title: string;
  whatYouSell: string;
  whoYouSellTo: string;
  pricingTiers: PricingTier[];
  offerSummary: string;
  whyBlueOcean: string;
  competitors: Competitor[];
  sevenDayPlan: PlanDay[];
}

export type Quadrant = 'blue_ocean' | 'red_ocean' | 'dead_zone' | 'too_niche';

export interface MatrixResult {
  demand: number;
  competition: number;
  quadrant: Quadrant;
  explanation: string;
  recommendation: string;
  pivotSuggestion: string;
}

export interface MatrixEntry extends MatrixResult {
  id: string;
  idea: string;
  createdAt: string;
}

export interface GeneratedProspect {
  name: string;
  role: string;
  companyType: string;
  signal: string;
  whyLikely: string;
  openingAngle: string;
  whereToFind: string;
}

export interface ProspectList {
  prospects: GeneratedProspect[];
  researchNotes: string;
}

export type ProspectStatus = 'new' | 'messaged' | 'loom_sent' | 'replied' | 'call_booked';

export interface SavedProspect extends GeneratedProspect {
  id: string;
  status: ProspectStatus;
  createdAt: string;
}

export interface ReplyBranch {
  ifTheySay: string;
  respondWith: string;
}

export interface Sequence {
  connectionMessage: string;
  followUp: string;
  loomScript: string;
  replyHandling: ReplyBranch[];
  callBookingAsk: string;
}

export interface OutreachPackage {
  outbound: Sequence;
  inbound: Sequence;
}

/** Everything for the Launch feature, persisted per-user in Firestore. */
export interface LaunchState {
  activeOffer: Offer | null;
  prospects: SavedProspect[];
  /** Generated outreach keyed by prospect id. */
  outreach: Record<string, OutreachPackage>;
  /** 30-day plan: Set of "day:task" keys that are checked. Stored as string[]. */
  planDone: string[];
  matrixHistory: MatrixEntry[];
}

export const EMPTY_LAUNCH_STATE: LaunchState = {
  activeOffer: null,
  prospects: [],
  outreach: {},
  planDone: [],
  matrixHistory: [],
};
