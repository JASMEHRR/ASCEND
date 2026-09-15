/**
 * Attendance: mark each timetable lesson attended or missed per occurrence,
 * see a running per-subject percentage. Reads the same weekly Timetable the
 * Timetable module manages — this is purely the "did it happen" log on top.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Check, X, CalendarOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Panel from '../../components/ui/Panel';
import { to12h, toDateKey } from '../../lib/time';
import { getTimetable } from '../timetable/timetableClient';
import { getAttendanceRange, setAttendance } from './attendanceClient';
import { attendanceSubject } from './subjectRules';
import type { Lesson } from '../timetable/types';
import type { AttendanceRecord, AttendanceStatus } from './types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STATS_WINDOW_DAYS = 90;

export default function AttendanceHub() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(() => new Date());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const from = new Date();
      from.setDate(from.getDate() - STATS_WINDOW_DAYS);
      const [tt, recs] = await Promise.all([
        getTimetable(user.uid),
        getAttendanceRange(user.uid, toDateKey(from), toDateKey(new Date())),
      ]);
      if (cancelled) return;
      setLessons(tt?.lessons ?? []);
      setRecords(recs);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const dateKey = toDateKey(selected);
  const weekday = selected.getDay();
  const dayLessons = useMemo(
    () =>
      (lessons ?? [])
        .filter((l) => l.day === weekday && attendanceSubject(l.subject) !== null)
        .sort((a, b) => a.start.localeCompare(b.start)),
    [lessons, weekday],
  );
  const recordFor = (lessonId: string) => records.find((r) => r.lessonId === lessonId && r.date === dateKey);

  const mark = async (lesson: Lesson, status: AttendanceStatus) => {
    if (!user) return;
    const key = `${lesson.id}_${dateKey}`;
    setBusyKey(key);
    try {
      await setAttendance(user.uid, lesson.id, dateKey, status);
      setRecords((prev) => [...prev.filter((r) => !(r.lessonId === lesson.id && r.date === dateKey)), { lessonId: lesson.id, date: dateKey, status }]);
    } finally {
      setBusyKey(null);
    }
  };

  const stats = useMemo(() => {
    const bySubject = new Map<string, { attended: number; total: number }>();
    // Bucketed through attendanceSubject: Field Work/Free drop out entirely,
    // SIP and Mentor Meeting merge into one "SIP" bucket.
    const subjectOf = new Map(
      (lessons ?? [])
        .map((l) => [l.id, attendanceSubject(l.subject)] as const)
        .filter((entry): entry is [string, string] => entry[1] !== null),
    );
    for (const r of records) {
      const subject = subjectOf.get(r.lessonId);
      if (!subject) continue; // excluded subject, or a lesson since deleted from the timetable
      if (r.status === 'did_not_happen') continue; // cancelled class — doesn't count either way
      const entry = bySubject.get(subject) ?? { attended: 0, total: 0 };
      entry.total += 1;
      if (r.status === 'attended') entry.attended += 1;
      bySubject.set(subject, entry);
    }
    return [...bySubject.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [records, lessons]);
  const overall = useMemo(() => {
    const totals = stats.reduce((acc, [, s]) => ({ attended: acc.attended + s.attended, total: acc.total + s.total }), { attended: 0, total: 0 });
    return totals.total > 0 ? Math.round((totals.attended / totals.total) * 100) : null;
  }, [stats]);

  const isToday = dateKey === toDateKey(new Date());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <CalendarCheck size={18} className="text-brand-400" /> Attendance
        </h2>
      </div>
      <p className="-mt-3 text-[11px] leading-snug text-white/35">
        Mark each day as it happens. Field Work and Free periods aren't tracked; SIP and Mentor Meeting count together as one subject, SIP.
      </p>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setSelected((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="Previous day"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-[12.5px] font-bold text-white/85">
            {isToday ? 'Today · ' : ''}
            {DAY_NAMES[weekday]}, {selected.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => setSelected((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))}
            disabled={isToday}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white cursor-pointer disabled:opacity-25 disabled:hover:bg-transparent"
            aria-label="Next day"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {!loaded ? (
          <p className="text-[13px] text-white/35">Loading…</p>
        ) : dayLessons.length === 0 ? (
          <p className="text-[13px] text-white/35">No lessons on the timetable for this day.</p>
        ) : (
          <div className="space-y-1.5">
            {dayLessons.map((l) => {
              const rec = recordFor(l.id);
              const key = `${l.id}_${dateKey}`;
              const busy = busyKey === key;
              return (
                <div key={l.id} className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-white/85">{l.subject || '(untitled)'}</span>
                    <span className="block font-mono text-[10.5px] text-white/40">
                      {to12h(l.start)}–{to12h(l.end)}
                      {l.room ? ` · ${l.room}` : ''}
                    </span>
                  </span>
                  <button
                    onClick={() => mark(l, 'attended')}
                    disabled={busy}
                    className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 ${
                      rec?.status === 'attended'
                        ? 'border-brand-400/40 bg-brand-500/20 text-brand-300'
                        : 'border-white/10 bg-white/[0.04] text-white/40 hover:text-white'
                    }`}
                  >
                    <Check size={11} /> Attended
                  </button>
                  <button
                    onClick={() => mark(l, 'not_attended')}
                    disabled={busy}
                    className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 ${
                      rec?.status === 'not_attended'
                        ? 'border-red-400/40 bg-red-500/20 text-red-300'
                        : 'border-white/10 bg-white/[0.04] text-white/40 hover:text-white'
                    }`}
                  >
                    <X size={11} /> Not attended
                  </button>
                  <button
                    onClick={() => mark(l, 'did_not_happen')}
                    disabled={busy}
                    aria-label="Did not happen (cancelled)"
                    title="Did not happen — cancelled, doesn't count against you"
                    className={`flex shrink-0 items-center justify-center rounded-full border p-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
                      rec?.status === 'did_not_happen'
                        ? 'border-white/30 bg-white/15 text-white/80'
                        : 'border-white/10 bg-white/[0.04] text-white/30 hover:text-white/70'
                    }`}
                  >
                    <CalendarOff size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
            Last {STATS_WINDOW_DAYS} days
          </p>
          {overall !== null && (
            <p className={`text-[13px] font-extrabold ${overall >= 75 ? 'text-brand-300' : 'text-red-300'}`}>{overall}% overall</p>
          )}
        </div>
        {stats.length === 0 ? (
          <p className="text-[13px] text-white/35">Nothing marked yet.</p>
        ) : (
          <ul className="space-y-2">
            {stats.map(([subject, { attended, total }]) => {
              const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
              return (
                <li key={subject} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-[12px] font-semibold text-white/80">{subject}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className={`h-full rounded-full ${pct >= 75 ? 'bg-brand-400' : 'bg-red-400/70'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-[11px] text-white/50">
                    {attended}/{total} ({pct}%)
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
