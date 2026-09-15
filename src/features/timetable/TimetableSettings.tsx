/**
 * Timetable settings block — upload a photo, review what Gemini read off it,
 * fix anything wrong, save. Lives in Settings next to Reminders and Google,
 * because that's where "what should Ascend proactively text me about" lives.
 */
import { useRef, useState } from 'react';
import { CalendarDays, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { prepareImage } from '../arena/logic/image';
import { getTimetable, parseTimetableImage, saveTimetable } from './timetableClient';
import type { Lesson, Weekday } from './types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function blankLesson(day: Weekday = 1): Lesson {
  return { id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, day, start: '09:00', end: '10:00', subject: '' };
}

export default function TimetableSettings() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const ensureLoaded = async () => {
    if (loaded || !user) return;
    setLoaded(true);
    const existing = await getTimetable(user.uid);
    if (existing) setLessons(existing.lessons);
  };

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
  const removeLesson = (id: string) => setLessons((prev) => (prev ? prev.filter((l) => l.id !== id) : prev));
  const addLesson = () => setLessons((prev) => [...(prev ?? []), blankLesson()]);

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

  return (
    <section className="space-y-2.5" onFocus={ensureLoaded} onClick={ensureLoaded}>
      <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Timetable</span>
      <p className="text-[11px] leading-snug text-white/35">
        Upload a photo of your class schedule. Jarvis reads it once, you fix anything wrong, then it texts you 5 minutes
        before every lesson — as long as the cron below is running often enough (see the note in Settings → Telegram).
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

      {error && <p className="text-[11px] text-red-300/90">{error}</p>}

      {sorted && sorted.length > 0 && (
        <div className="space-y-1.5">
          {sorted.map((l) => (
            <LessonRow key={l.id} lesson={l} onChange={(f) => updateLesson(l.id, f)} onRemove={() => removeLesson(l.id)} />
          ))}

          <button
            onClick={addLesson}
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
    </section>
  );
}

function LessonRow({ lesson, onChange, onRemove }: { lesson: Lesson; onChange: (f: Partial<Lesson>) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-brand-400/25 bg-brand-500/5 px-3 py-2.5">
        <div className="flex gap-2">
          <select
            value={lesson.day}
            onChange={(e) => onChange({ day: Number(e.target.value) as Weekday })}
            className="liquid-glass-input rounded-lg px-2 py-1.5 text-[12px] text-white outline-none"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={i} value={i} className="bg-[#0a0e14]">
                {d}
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
          <button onClick={onRemove} className="text-[10.5px] text-white/30 hover:text-red-400/80 cursor-pointer">
            Remove
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg bg-brand-500/15 px-2.5 py-1 text-[10.5px] font-bold text-brand-300 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <span className="w-8 shrink-0 font-mono text-[10px] font-bold text-white/40">{DAY_NAMES[lesson.day]}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white/85">{lesson.subject || '(untitled)'}</span>
      <span className="shrink-0 font-mono text-[10.5px] text-white/40">
        {lesson.start}–{lesson.end}
      </span>
      <button onClick={() => setEditing(true)} aria-label={`Edit ${lesson.subject}`} className="shrink-0 rounded-lg p-1 text-white/30 hover:bg-white/10 hover:text-white cursor-pointer">
        <Pencil size={12} />
      </button>
      <button onClick={onRemove} aria-label={`Remove ${lesson.subject}`} className="shrink-0 rounded-lg p-1 text-white/30 hover:bg-white/10 hover:text-red-400 cursor-pointer">
        <Trash2 size={12} />
      </button>
    </div>
  );
}
