/**
 * What Telegram texts about on its own, and when. The server cron reads the
 * same doc (users/{uid}/telegramPrefs/main) through the Admin SDK — see
 * prefs.ts for the shared shape and defaults.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2, Send } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { to12h } from '../../lib/time';
import { resolvePrefs, telegramPrefsPath, type TelegramPrefs } from './prefs';

type Toggle = 'emailAlerts' | 'habitNudges' | 'studyNudges';
type TimeField = 'wakeTime' | 'middayTime' | 'eveningTime' | 'nightTime' | 'studyTime' | 'sleepTime';

const TOGGLES: { key: Toggle; label: string; hint: string }[] = [
  { key: 'emailAlerts', label: 'Important email', hint: 'Internships, jobs, deadlines, college mail. Needs Gmail connected below.' },
  { key: 'habitNudges', label: 'Habit nudges', hint: 'Morning, midday, evening and a night check of what is still open.' },
  { key: 'studyNudges', label: 'Study reminders', hint: 'Revise after your last class, and a study-time text with tomorrow’s subjects.' },
];

const TIMES: { key: TimeField; label: string }[] = [
  { key: 'wakeTime', label: 'Wake-up' },
  { key: 'middayTime', label: 'Midday check' },
  { key: 'eveningTime', label: 'Evening habits' },
  { key: 'nightTime', label: 'Night check' },
  { key: 'studyTime', label: 'Study time' },
  { key: 'sleepTime', label: 'Sleep' },
];

export default function TelegramAlertsSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<TelegramPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDoc(doc(db, telegramPrefsPath(user.uid)))
      .then((snap) => {
        if (!cancelled) setPrefs(resolvePrefs(snap.exists() ? snap.data() : undefined));
      })
      .catch(() => {
        if (!cancelled) setPrefs(resolvePrefs(undefined));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = (fields: Partial<TelegramPrefs>) => {
    setPrefs((p) => (p ? { ...p, ...fields } : p));
    setStatus(null);
  };

  const save = async () => {
    if (!user || !prefs) return;
    setBusy(true);
    try {
      // The zone is recorded on every save: the server has no browser to ask.
      await setDoc(doc(db, telegramPrefsPath(user.uid)), {
        ...prefs,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updatedAt: new Date().toISOString(),
      });
      setStatus('Saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2.5">
      <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Telegram alerts</span>
      <p className="text-[11px] leading-snug text-white/35">
        What Jarvis texts you about without being asked. Class alerts and calendar events always come through.
      </p>

      {!prefs ? (
        <p className="flex items-center gap-2 text-[11px] text-white/35">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {TOGGLES.map(({ key, label, hint }) => (
              <button
                key={key}
                onClick={() => update({ [key]: !prefs[key] })}
                role="switch"
                aria-checked={prefs[key]}
                className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left transition-colors hover:border-white/20 cursor-pointer"
              >
                <span
                  aria-hidden="true"
                  className={`relative mt-0.5 h-[16px] w-[28px] shrink-0 rounded-full border transition-colors ${
                    prefs[key] ? 'border-brand-400/50 bg-brand-500/30' : 'border-white/12 bg-white/8'
                  }`}
                >
                  <span
                    className={`absolute top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full bg-white shadow transition-all ${
                      prefs[key] ? 'left-[14px]' : 'left-[2px]'
                    }`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold text-white/85">{label}</span>
                  <span className="block text-[10.5px] leading-snug text-white/35">{hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TIMES.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/40">{label}</span>
                <input
                  type="time"
                  value={prefs[key]}
                  onChange={(e) => e.target.value && update({ [key]: e.target.value })}
                  className="liquid-glass-input rounded-lg px-2 py-1 text-[12px] text-white outline-none"
                />
                <span className="text-[10px] text-white/30">{to12h(prefs[key])}</span>
              </label>
            ))}
          </div>
          <p className="text-[10.5px] leading-snug text-white/30">
            Email that arrives between Sleep and Wake-up waits until the morning instead of buzzing you.
          </p>

          <button
            onClick={save}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-500/30 bg-brand-500/15 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-brand-300 transition-colors hover:bg-brand-500/25 disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {status === 'Saved' ? 'Saved' : 'Save alert settings'}
          </button>
          {status && status !== 'Saved' && <p className="text-[11px] text-red-300/90">{status}</p>}
        </>
      )}
    </section>
  );
}
