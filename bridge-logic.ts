/**
 * Pure rules for the laptop bridge (bridge-routes.ts serves them, the laptop runs
 * tools/laptop-bridge). Kept free of Express and Firestore so they can be tested
 * on their own: bridge-logic.test.ts.
 *
 * Who sets which status:
 *   Muse:   creates 'pending', sets 'redo' (+ notes), 'approved', 'cancelled'
 *   Bridge: 'running' (claim), 'awaiting_review' (a version is ready), 'failed'
 * The bridge can never set 'redo' or 'approved': that is the review gate.
 */

export const BRIDGE_ACTION = 'clipforge.blocky';
export const MAX_VERSIONS = 3;

export type Work =
  | { kind: 'render'; version: number }
  | { kind: 'revise'; version: number; notes: string }
  | { kind: 'hold'; reason: string }
  | { kind: 'recover' }
  | null;

export interface JobLike {
  action?: unknown;
  status?: unknown;
  notes?: unknown;
  claimedBy?: unknown;
  versions?: unknown;
}

function versionsOf(job: JobLike): { n: number; notes: string }[] {
  if (!Array.isArray(job.versions)) return [];
  return job.versions
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    .map((v) => ({ n: Number(v.n) || 0, notes: typeof v.notes === 'string' ? v.notes : '' }));
}

/** What the laptop should do with this job right now, or null for "leave it alone". */
export function nextWork(job: JobLike, host: string): Work {
  if (job.action !== BRIDGE_ACTION) return null;
  const done = versionsOf(job);
  if (job.status === 'pending') return done.length ? null : { kind: 'render', version: 1 };
  if (job.status === 'running') {
    // A job this laptop claimed but never finished: the bridge stopped mid-render.
    return job.claimedBy === host ? { kind: 'recover' } : null;
  }
  if (job.status !== 'redo') return null;
  const notes = typeof job.notes === 'string' ? job.notes.trim() : '';
  if (!done.length) return { kind: 'render', version: 1 };
  if (done.length >= MAX_VERSIONS) {
    return { kind: 'hold', reason: `Version cap reached: ${MAX_VERSIONS} versions made. JasMehr needs to look.` };
  }
  if (!notes) return { kind: 'hold', reason: 'Redo needs written notes. Nothing was re-rendered.' };
  const last = done[done.length - 1];
  if (last.notes.trim() === notes) {
    return { kind: 'hold', reason: 'These notes were already answered by the last version. Write new notes to get another version.' };
  }
  return { kind: 'revise', version: done.length + 1, notes };
}

/** The atomic claim is one lock document per (job, version): a second claim of the same version fails. */
export function claimLockPath(uid: string, jobId: string, version: number): string {
  return `users/${uid}/jobs/${jobId}/claims/v${version}`;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export function safeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id);
}

const SAFE_HOST = /^[A-Za-z0-9._-]{1,64}$/;
export function safeHost(host: unknown): host is string {
  return typeof host === 'string' && SAFE_HOST.test(host);
}

const NAME = /^[A-Za-z0-9._ -]{1,120}$/;
const FOLDER = /^[A-Za-z0-9_-]{1,128}\/v[0-9]{1,2}$/;

export interface VersionIn {
  n: number;
  notes: string;
  folder: string;
  files: { video: string; frameSheet: string; frames: string[]; narration: string; story: string };
  durationS: number;
  shots: number;
  madeAt: string;
}

/** Validates a version record sent by the laptop. Returns the clean record or an error string. */
export function cleanVersion(v: unknown, expectedN: number): VersionIn | string {
  if (!v || typeof v !== 'object') return 'version must be an object';
  const o = v as Record<string, unknown>;
  const files = (o.files ?? {}) as Record<string, unknown>;
  if (o.n !== expectedN) return `version number must be ${expectedN}`;
  if (typeof o.folder !== 'string' || !FOLDER.test(o.folder)) return 'folder must look like <job id>/v<n>';
  for (const k of ['video', 'frameSheet', 'narration', 'story'] as const) {
    if (typeof files[k] !== 'string' || !NAME.test(files[k] as string)) return `files.${k} is not a plain file name`;
  }
  const frames = files.frames;
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 40
      || !frames.every((f) => typeof f === 'string' && NAME.test(f))) {
    return 'files.frames must be 1 to 40 plain file names';
  }
  const durationS = Number(o.durationS);
  const shots = Number(o.shots);
  if (!Number.isFinite(durationS) || durationS <= 0 || durationS > 600) return 'durationS out of range';
  if (!Number.isInteger(shots) || shots < 1 || shots > 40) return 'shots out of range';
  if (typeof o.madeAt !== 'string' || Number.isNaN(Date.parse(o.madeAt))) return 'madeAt must be an ISO time';
  const notes = typeof o.notes === 'string' ? o.notes.slice(0, 5000) : '';
  return {
    n: expectedN, notes, folder: o.folder,
    files: {
      video: files.video as string, frameSheet: files.frameSheet as string,
      frames: frames as string[], narration: files.narration as string, story: files.story as string,
    },
    durationS: Math.round(durationS * 100) / 100, shots, madeAt: o.madeAt,
  };
}

/** Error text from the laptop, trimmed so a stack trace cannot fill the document. */
export function cleanError(e: unknown): string {
  const s = typeof e === 'string' ? e.trim() : '';
  return (s || 'The laptop reported a failure without a message.').slice(0, 2000);
}
