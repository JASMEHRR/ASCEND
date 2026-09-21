/**
 * What Telegram may text about on its own, and when. Edited in Settings,
 * read by the server cron (telegram-cron.ts) through the Admin SDK — pure,
 * no Firestore import, so both sides share one definition of the defaults.
 *
 * Stored at users/{uid}/telegramPrefs/main. Any field that's missing or
 * malformed falls back to the default, so an old or hand-edited doc can never
 * switch a nudge off by accident.
 */
export interface TelegramPrefs {
  emailAlerts: boolean;
  habitNudges: boolean;
  studyNudges: boolean;
  /** All times "HH:MM", 24-hour, in timeZone. */
  wakeTime: string;
  middayTime: string;
  eveningTime: string;
  nightTime: string;
  studyTime: string;
  /** From here until wakeTime, email alerts wait instead of buzzing. */
  sleepTime: string;
  /** IANA zone of the browser that last saved these prefs. */
  timeZone?: string;
}

export const DEFAULT_TELEGRAM_PREFS: TelegramPrefs = {
  emailAlerts: true,
  habitNudges: true,
  studyNudges: true,
  wakeTime: '07:00',
  middayTime: '13:00',
  eveningTime: '18:30',
  nightTime: '21:30',
  studyTime: '20:00',
  sleepTime: '23:30',
};

export const telegramPrefsPath = (uid: string) => `users/${uid}/telegramPrefs/main`;

const TOGGLES = ['emailAlerts', 'habitNudges', 'studyNudges'] as const;
const TIMES = ['wakeTime', 'middayTime', 'eveningTime', 'nightTime', 'studyTime', 'sleepTime'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Between sleepTime and wakeTime. Handles the usual case where the window
 * crosses midnight (23:30 -> 07:00) as well as one that doesn't.
 */
export function isQuietTime(prefs: Pick<TelegramPrefs, 'sleepTime' | 'wakeTime'>, minutes: number): boolean {
  const sleep = toMinutes(prefs.sleepTime);
  const wake = toMinutes(prefs.wakeTime);
  if (sleep === wake) return false;
  return sleep > wake ? minutes >= sleep || minutes < wake : minutes >= sleep && minutes < wake;
}

/** A stored doc (possibly partial, old, or malformed) -> complete prefs. */
export function resolvePrefs(stored: Record<string, unknown> | undefined): TelegramPrefs {
  const out: TelegramPrefs = { ...DEFAULT_TELEGRAM_PREFS };
  if (!stored) return out;
  for (const key of TOGGLES) {
    const v = stored[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  for (const key of TIMES) {
    const v = stored[key];
    if (typeof v === 'string' && HHMM.test(v)) out[key] = v;
  }
  if (typeof stored.timeZone === 'string' && stored.timeZone) out.timeZone = stored.timeZone;
  return out;
}
