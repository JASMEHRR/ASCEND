/**
 * The Puzzle tab: this week's picture, spare tiles, and older weeks you can
 * still repair.
 */
import { useRef, useState } from 'react';
import { Eye, ImagePlus, Link2, ListPlus, Loader2, Puzzle, Upload, Wrench } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { usePuzzle } from '../usePuzzle';
import { measureImage, prepareImage } from '../logic/image';
import PuzzleCanvas from './PuzzleCanvas';

export default function ArenaPuzzle({ onNeedHabits }: { onNeedHabits?: () => void }) {
  const { habits } = useArena();
  const { loading, busy, current, repairable, canvases, available, setImage, place, reveal } = usePuzzle();
  const [landing, setLanding] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Lets the player swap a picture they've already started — needed when a
  // pasted link turns out not to be an image.
  const [changing, setChanging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/25" />
      </div>
    );
  }

  const applyUrl = async (src: string) => {
    setError(null);
    try {
      // Measured first, so a bad link fails here rather than saving a canvas
      // that renders as an empty grid.
      const aspect = await measureImage(src);
      await setImage(src, aspect);
      setChanging(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That link could not be used.');
    }
  };

  /** Uploads are downscaled to fit Firestore's 1 MB document limit. */
  const onFile = async (file: File) => {
    setError(null);
    try {
      const { dataUrl, aspect } = await prepareImage(file);
      await setImage(dataUrl, aspect);
      setChanging(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be used.');
    }
  };

  const placeOn = async (week: string) => {
    const tile = await place(week);
    if (!tile) return;
    setLanding(tile.index);
    window.setTimeout(() => setLanding(null), 700);
  };

  // The grid is sized from your habits, so there's nothing to cut up until
  // some exist. Choosing an image first would make a 1-piece puzzle.
  if (habits.length === 0) {
    return (
      <div className="mx-auto flex min-h-[280px] max-w-sm flex-col items-center justify-center gap-3 text-center">
        <ListPlus size={28} className="text-white/20" />
        <h3 className="text-[15px] font-bold text-white">Add your habits first</h3>
        <p className="text-[12px] leading-snug text-white/40">
          The picture is cut into one piece per habit per day, so your habits decide the grid. Add a few and
          then pick an image.
        </p>
        {onNeedHabits && (
          <button
            onClick={onNeedHabits}
            className="mt-1 rounded-full bg-brand-500 px-4 py-2 text-[12px] font-bold text-black transition-all hover:bg-brand-400 cursor-pointer"
          >
            Add habits
          </button>
        )}
      </div>
    );
  }

  // No picture yet this week — or the player asked to swap the current one.
  if (!current || changing) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-6">
        <div className="text-center">
          <Puzzle size={28} className="mx-auto text-white/20" />
          <h3 className="mt-3 text-[15px] font-bold text-white">Pick this week's picture</h3>
          <p className="mt-1 text-[12px] leading-snug text-white/40">
            {habits.length} {habits.length === 1 ? 'habit' : 'habits'} × 7 days ={' '}
            <span className="font-bold text-white/60">{habits.length * 7} pieces</span> this week.
          </p>
        </div>

        <div className="liquid-glass-panel space-y-2.5 rounded-3xl p-5">
          <label className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
            <Link2 size={11} /> Paste an image link
          </label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && void applyUrl(url.trim())}
              placeholder="https://…"
              className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
            />
            <button
              onClick={() => url.trim() && void applyUrl(url.trim())}
              disabled={!url.trim() || busy}
              className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-[12px] font-bold text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
            >
              Use
            </button>
          </div>

          <div className="flex items-center gap-2 py-1">
            <span className="h-px flex-1 bg-white/8" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">or</span>
            <span className="h-px flex-1 bg-white/8" />
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] py-2.5 text-[12px] font-bold text-white/85 transition-all hover:bg-white/[0.1] disabled:opacity-40 cursor-pointer"
          >
            <Upload size={14} /> Upload from this device
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
          />
          <p className="text-[10px] leading-snug text-white/25">
            Uploads are shrunk to fit and stored with your board — only your room can see them, and only once
            you reveal the finished picture. A pasted link stays as public as wherever it's hosted.
          </p>
          {error && <p className="text-[11px] text-red-400/90">{error}</p>}
        </div>

        {current && (
          <button
            onClick={() => {
              setChanging(false);
              setError(null);
            }}
            className="mx-auto block text-[11.5px] font-semibold text-white/40 transition-colors hover:text-white/80 cursor-pointer"
          >
            Keep the current picture
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white/90">
            {current.placed} / {current.total} pieces
          </p>
          <p className="font-mono text-[10px] text-white/35">
            {current.complete ? 'Finished' : `${current.total - current.placed} to go`} · {current.week}
          </p>
        </span>
        {available > 0 && !current.complete && (
          <button
            onClick={() => placeOn(current.week)}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-2 text-[11px] font-bold text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
          >
            <Puzzle size={13} /> Place ({available})
          </button>
        )}
        <button
          onClick={() => setChanging(true)}
          className="shrink-0 rounded-full border border-white/12 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-white/55 transition-all hover:bg-white/[0.1] hover:text-white cursor-pointer"
        >
          Change picture
        </button>
        {current.complete && !current.revealed && (
          <button
            onClick={() => reveal(current.week)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-2 text-[11px] font-bold text-white/85 transition-all hover:bg-white/[0.12] cursor-pointer"
          >
            <Eye size={13} /> Show the room
          </button>
        )}
      </div>

      <PuzzleCanvas
        imageUrl={current.imageUrl}
        cols={current.cols}
        rows={current.rows}
        aspect={current.aspect}
        placements={current.placements}
        landing={landing}
      />

      {/* Old unfinished weeks — spare tiles can still rescue them. */}
      {repairable.length > 0 && (
        <section className="space-y-2 border-t border-white/8 pt-4">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
            <Wrench size={11} /> Unfinished weeks
          </p>
          <p className="text-[10.5px] leading-snug text-white/30">
            Spare pieces can go back and finish these. Repaired pieces are marked with a dot.
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {repairable.map((c) => (
              <button
                key={c.week}
                onClick={() => available > 0 && placeOn(c.week)}
                disabled={available === 0 || busy}
                className="space-y-1.5 rounded-2xl border border-white/8 bg-white/[0.03] p-2 text-left transition-all hover:border-white/20 disabled:cursor-default disabled:opacity-60 cursor-pointer"
              >
                <PuzzleCanvas
                  imageUrl={c.imageUrl}
                  cols={c.cols}
                  rows={c.rows}
                  aspect={c.aspect}
                  placements={c.placements}
                />
                <span className="block px-0.5 font-mono text-[9.5px] text-white/35">
                  {c.week} · {c.placed}/{c.total}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Finished pictures. The year becomes a gallery. */}
      {canvases.some((c) => c.complete) && (
        <section className="space-y-2 border-t border-white/8 pt-4">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-white/40">
            <ImagePlus size={11} /> Gallery
          </p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {canvases
              .filter((c) => c.complete)
              .map((c) => (
                <div key={c.week} className="space-y-1">
                  <PuzzleCanvas
                    imageUrl={c.imageUrl}
                    cols={c.cols}
                    rows={c.rows}
                    aspect={c.aspect}
                    placements={c.placements}
                  />
                  <span className="block px-0.5 font-mono text-[9px] text-white/30">{c.week}</span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
