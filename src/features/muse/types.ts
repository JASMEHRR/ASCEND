/**
 * What links Muse, Jarvis and the projects on JasMehr's laptop. Firestore is the
 * only meeting point: Muse (Meta's cloud agent) writes with its own Admin SDK key,
 * the laptop bridge (tools/laptop-bridge) writes through /api/bridge with a narrow
 * key of its own, and this app only reads, plus the few user-owned fields that
 * firestore.rules allows. Full contract: docs/MUSE-LINKS.md.
 *
 *   users/{uid}/status/{project}  how each project last ran (bridge and Muse write)
 *   users/{uid}/jobs/{id}         work Muse asks the laptop to do (Muse creates, bridge runs)
 *   users/{uid}/leads/{slug}      people Muse could sell to (Muse writes, you approve)
 */

// --- Project status -------------------------------------------------------------

/** Status docs the laptop bridge may write. Muse may also write its own 'muse' doc. */
export const BRIDGE_PROJECTS = ['laptop', 'clipforge', 'athena', 'post-studio'] as const;
export type BridgeProject = (typeof BRIDGE_PROJECTS)[number];

export interface ProjectStatus {
  project: string;
  label: string;
  /** true = working, false = something is wrong, null = unknown. */
  ok: boolean | null;
  summary: string;
  /** Things only JasMehr can do. Telegram texts each one once. */
  needsYou: string[];
  numbers: Record<string, number>;
  /** When the project last did its own work (a nightly run, a study session). */
  lastRunAt: string | null;
  /** When this status was written. */
  updatedAt: string | null;
  source: string;
  host: string;
}

// --- Laptop jobs ----------------------------------------------------------------

export const JOB_ACTIONS = ['status.refresh', 'clipforge.clip'] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

export const JOB_STATUSES = ['pending', 'running', 'done', 'failed', 'cancelled', 'rejected', 'expired'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface LaptopJob {
  id: string;
  action: string;
  args: Record<string, unknown>;
  status: JobStatus;
  requestedBy: string;
  note: string;
  createdAt: string | null;
  claimedAt: string | null;
  finishedAt: string | null;
  summary: string;
  error: string;
  result: Record<string, string | number | boolean>;
}

// --- Leads ----------------------------------------------------------------------

export const LEAD_STATUSES = ['to-review', 'approved', 'sent', 'replied', 'won', 'lost', 'skipped'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: string;
  kind: string;
  offer: string;
  name: string;
  platform: string;
  link: string | null;
  audience: string;
  contact: string;
  contactChannel: string;
  /** 0 to 10, or null when Muse hasn't scored it. */
  score: number | null;
  why: string;
  draftSubject: string;
  draftMessage: string;
  /** His edited version. Muse sends this when it isn't empty, else draftMessage. */
  finalMessage: string;
  status: LeadStatus;
  sentAt: string | null;
  lastReplyAt: string | null;
  lastReplySnippet: string | null;
  flags: string;
  notes: string;
  source: string;
  updatedAt: string | null;
}

/** The only lead fields the browser may write (firestore.rules enforces the same). */
export type LeadPatch = { status: LeadStatus } | { notes: string } | { finalMessage: string } | { status: LeadStatus; finalMessage: string };
