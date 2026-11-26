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

/** The only action the bridge runs in v1 is 'clipforge.blocky'; the others are reserved names. */
export const JOB_ACTIONS = ['status.refresh', 'clipforge.clip', 'clipforge.blocky'] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

/**
 * 'pending' is "queued": Muse created it and no laptop has it yet. 'running' covers
 * picked up and building (see `stage`). The review loop adds three states:
 * awaiting_review (a version is in the Outbox), redo (Muse wrote notes for the next
 * version) and approved (Muse says it is ready for JasMehr; nothing is ever posted).
 */
export const JOB_STATUSES = [
  'pending', 'running', 'awaiting_review', 'redo', 'approved',
  'done', 'failed', 'cancelled', 'rejected', 'expired',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Within 'running': claimed, then rendering. */
export const JOB_STAGES = ['picked_up', 'building'] as const;
export type JobStage = (typeof JOB_STAGES)[number];

/** Versions a single review job may produce before it waits for JasMehr. */
export const MAX_JOB_VERSIONS = 3;

/** One rendered version and its review pack, as file names inside the Outbox folder. */
export interface JobVersion {
  n: number;
  /** The redo notes this version answers ('' for version 1). */
  notes: string;
  /** Folder inside "ClipForge Outbox", e.g. "<job id>/v2". */
  folder: string;
  files: { video: string; frameSheet: string; frames: string[]; narration: string; story: string };
  durationS: number;
  shots: number;
  madeAt: string;
}

export interface LaptopJob {
  id: string;
  action: string;
  /** clipforge.blocky: { premise: string } or { story: <Blocky story JSON> }. */
  args: Record<string, unknown>;
  status: JobStatus;
  stage: JobStage | null;
  requestedBy: string;
  note: string;
  /** Muse's review notes for the next version (set together with status 'redo'). */
  notes: string;
  /** Optional with 'redo': the full next-version story, written by Muse; rendered as is. */
  nextStory: Record<string, unknown> | null;
  version: number;
  versions: JobVersion[];
  claimedBy: string | null;
  createdAt: string | null;
  claimedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
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
