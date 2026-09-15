/**
 * Timetable module: upload a photo of a weekly class schedule, review what
 * Gemini read off it as an actual day-by-time grid, fix anything wrong, save.
 * Jarvis texts you 5 minutes before each lesson via the Telegram cron (see
 * server/telegram-cron.ts) — as long as that cron is being pinged often
 * enough (Settings → Connections).
 */
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Panel from '../../components/ui/Panel';
import { to12h } from '../../lib/time';
import { prepareImage } from '../arena/logic/image';
import { getTimetable, parseTimetableImage, saveTimetable } from './timetableClient';
import { nextLesson } from './nextLesson';
import type { Lesson, Weekday } from './types';

/** Monday-first column order — how a class timetable actually reads, unlike Lesson#day (0=Sun, Date#getDay order). */
const DAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function blankLesson(day: Weekday = 1, start = '09:00'): Lesson {
  const endMin = toMinutes(start) + 70;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  return { id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, day, start, end, subject: '' };
}

export default function TimetableHub() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getTimetable(user.uid).then((tt) => {
      if (!cancelled && tt) setLessons(tt.lessons);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const { dataUrl } = await prepareImage(file);
      const parsed = await parseTimetableImage(dataUrl);
      if (parsed.length === 0) {
        setError("Couldn't find any lessons in that photo — try a straighter, brighter shot of the grid.");
      } else {
        setLessons(parsed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateLesson = (id: string, fields: Partial<Lesson>) =>
    setLessons((prev) => (prev ? prev.map((l) => (l.id === id ? { ...l, ...fields } : l)) : prev));
  const removeLesson = (id: string) => {
    setLessons((prev) => (prev ? prev.filter((l) => l.id !== id) : prev));
    setEditingId(null);
  };
  const addLesson = (day?: Weekday, start?: string) => {
    const l = blankLesson(day, start);
    setLessons((prev) => [...(prev ?? []), l]);
    setEditingId(l.id);
  };

  const save = async () => {
    if (!user || !lessons) return;
    setBusy(true);
    setError(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await saveTimetable(user.uid, lessons, timeZone);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the timetable.');
    } finally {
      setBusy(false);
    }
  };

  const sorted = lessons ? [...lessons].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)) : null;
  const next = sorted ? nextLesson(sorted) : null;
  const editingLesson = lessons?.find((l) => l.id === editingId) ?? null;

  // Grid rows: every distinct start time in use, earliest first — a real
  // timetable's period slots, not one row per lesson.
  const rowTimes = sorted
    ? [...new Set(sorted.map((l) => l.start))].sort((a, b) => toMinutes(a) - toMinutes(b))
    : [];
  const cellFor = (day: Weekday, start: string) => sorted?.find((l) => l.day === day && l.start === start) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <CalendarDays size={18} className="text-brand-400" /> Timetable
        </h2>
      </div>

      {next && (
        <Panel accent>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">Next lesson</p>
          <p className="mt-1 text-[14px] font-semibold text-white/90">
            {next.lesson.subject || '(untitled)'} — {next.label}
            {next.lesson.room ? ` · ${next.lesson.room}` : ''}
          </p>
        </Panel>
      )}

      <Panel>
        <p className="mb-3 text-[11px] leading-snug text-white/35">
          Upload a photo of your class schedule. Jarvis reads it once, you fix anything wrong, then it texts you 5 minutes
          before every lesson — as long as the cron is running often enough (Settings → Connections).
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[12px] font-bold text-white/85 transition-all hover:border-white/20 hover:bg-white/[0.09] disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {busy ? 'Reading...' : sorted && sorted.length > 0 ? 'Upload a different photo' : 'Upload timetable photo'}
        </button>

        {error && <p className="mt-2 text-[11px] text-red-300/90">{error}</p>}

        {sorted && sorted.length > 0 && (
          <div className="mt-3 space-y-3">
            {/* Grid is wider than the panel on phones — its own scroll container, not the page's. */}
            <div className="overflow-x-auto rounded-xl border border-white/8">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="w-16 border-b border-white/8 bg-white/[0.03] px-2 py-2 text-[9.5px] font-mono font-bold uppercase tracking-widest text-white/30" />
                    {DAY_ORDER.map((d) => (
                      <th
                        key={d}
                        className="border-b border-l border-white/8 bg-white/[0.03] px-2 py-2 text-center text-[10px] font-mono font-bold uppercase tracking-widest text-white/50"
                      >
                        {DAY_LABELS[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowTimes.map((start) => (
                    <tr key={start}>
                      <td className="border-b border-white/6 px-2 py-2 align-top font-mono text-[10px] text-white/40 whitespace-nowrap">
                        {to12h(start)}
                      </td>
                      {DAY_ORDER.map((d) => {
                        const lesson = cellFor(d, start);
                        return (
                          <td key={d} className="border-b border-l border-white/6 p-1 align-top">
                            {lesson ? (
                              <button
                                onClick={() => setEditingId(lesson.id)}
                                className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                                  editingId === lesson.id
                                    ? 'border-brand-400/50 bg-brand-500/15'
                                    : 'border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                                }`}
                              >
                                <span className="block truncate text-[11.5px] font-semibold text-white/85">
                                  {lesson.subject || '(untitled)'}
                                </span>
                                <span className="block font-mono text-[9.5px] text-white/35">
                                  {to12h(lesson.start)}–{to12h(lesson.end)}
                                  {lesson.room ? ` · ${lesson.room}` : ''}
                                </span>
                              </button>
                            ) : (
                              <button
                                onClick={() => addLesson(d, start)}
                                aria-label={`Add a lesson ${DAY_LABELS[d]} at ${to12h(start)}`}
                                className="flex h-full min-h-[2.6rem] w-full items-center justify-center rounded-lg border border-dashed border-white/0 text-white/0 transition-colors hover:border-white/15 hover:text-white/30 cursor-pointer"
                              >
                                <Plus size={13} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editingLesson && (
              <LessonEditor
                lesson={editingLesson}
                onChange={(f) => updateLesson(editingLesson.id, f)}
                onRemove={() => removeLesson(editingLesson.id)}
                onDone={() => setEditingId(null)}
              />
            )}

            <button
              onClick={() => addLesson()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/12 px-3 py-2 text-[11px] font-semibold text-white/40 transition-colors hover:border-white/25 hover:text-white/70 cursor-pointer"
            >
              <Plus size={12} /> Add lesson by hand
            </button>

            <button
              onClick={save}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500/15 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-brand-300 border border-brand-500/30 transition-colors hover:bg-brand-500/25 disabled:opacity-50 cursor-pointer"
            >
              <CalendarDays size={14} /> {saved ? 'Saved' : 'Save timetable'}
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function LessonEditor({
  lesson,
  onChange,
  onRemove,
  onDone,
}: {
  lesson: Lesson;
  onChange: (f: Partial<Lesson>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-brand-400/25 bg-brand-500/5 px-3 py-2.5">
      <div className="flex gap-2">
        <select
          value={lesson.day}
          onChange={(e) => onChange({ day: Number(e.target.value) as Weekday })}
          className="liquid-glass-input rounded-lg px-2 py-1.5 text-[12px] text-white outline-none"
        >
          {DAY_ORDER.map((d) => (
            <option key={d} value={d} className="bg-[#0a0e14]">
              {DAY_LABELS[d]}
            </option>
          ))}
        </select>
        <input
          value={lesson.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          placeholder="Subject"
          className="liquid-glass-input min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] text-white outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        {/* Native time input — the browser/OS controls whether its picker UI shows 12h or 24h; the value is always "HH:MM". */}
        <input
          type="time"
          value={lesson.start}
          onChange={(e) => onChange({ start: e.target.value })}
          className="liquid-glass-input rounded-lg px-2 py-1.5 text-[12px] text-white outline-none"
        />
        <span className="text-[11px] text-white/30">to</span>
        <input
          type="time"
          value={lesson.end}
          onChange={(e) => onChange({ end: e.target.value })}
          className="liquid-glass-input rounded-lg px-2 py-1.5 text-[12px] text-white outline-none"
        />
        <input
          value={lesson.room ?? ''}
          onChange={(e) => onChange({ room: e.target.value || undefined })}
          placeholder="Room (optional)"
          className="liquid-glass-input min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] text-white outline-none"
        />
      </div>
      <div className="flex justify-end gap-2 pt-0.5">
        <button onClick={onRemove} className="flex items-center gap-1 text-[10.5px] text-white/30 hover:text-red-400/80 cursor-pointer">
          <Trash2 size={11} /> Remove
        </button>
        <button onClick={onDone} className="rounded-lg bg-brand-500/15 px-2.5 py-1 text-[10.5px] font-bold text-brand-300 cursor-pointer">
          Done
        </button>
      </div>
    </div>
  );
}
