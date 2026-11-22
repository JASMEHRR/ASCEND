/**
 * Internship entries live at `users/{uid}/internships/{slug}`.
 *
 * Muse (JasMehr's separate agent) seeds and maintains these docs through its
 * own server credentials. The browser may only change `status`, `notes` and
 * `updatedAt`; every other field is Muse's and is never written from here
 * (firestore.rules enforces the same split).
 */

export const INTERNSHIP_STATUSES = ['to-review', 'apply-queue', 'applied', 'done', 'skipped', 'closed'] as const;
export type InternshipStatus = (typeof INTERNSHIP_STATUSES)[number];

export const EMAIL_STAGES = ['acknowledged', 'assessment', 'interview', 'offer', 'rejected'] as const;
export type EmailStage = (typeof EMAIL_STAGES)[number];

export interface Internship {
  id: string;
  ref: string;
  section: string;
  title: string;
  org: string;
  locationMode: string;
  stipendText: string;
  floorCheck: string;
  fullyFunded: boolean;
  deadlineText: string;
  autoApply: boolean;
  /** 0 to 10, or null when Muse hasn't scored it. */
  score: number | null;
  scoreReason: string;
  link: string | null;
  linkNote: string;
  flags: string;
  status: InternshipStatus;
  emailStage: EmailStage | null;
  lastEmailAt: string | null;
  lastEmailSubject: string | null;
  notes: string;
  source: string;
  updatedAt: string | null;
}

/** The only fields the browser is allowed to write. */
export type InternshipPatch = { status: InternshipStatus } | { notes: string };
