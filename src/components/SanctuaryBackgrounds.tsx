/**
 * Settings → Appearance → Sanctuary Atmosphere.
 *
 * Picks the active background (auto time-of-day, a built-in preset, or a
 * user-added photo) and manages the user's own uploaded/linked backgrounds.
 * Custom backgrounds reuse Arena's image prep (logic/image.ts) so an upload
 * gets the same downscale-to-fit treatment as a puzzle picture — there's no
 * separate file storage here either, just a compressed data URL in Firestore.
 */
import { useRef, useState } from 'react';
import { Check, Link2, Plus, Trash2, Upload } from 'lucide-react';
import { ATMOSPHERES } from './AtmosphereBackdrop';
import { prepareImage, measureImage } from '../features/arena/logic/image';
import type { CustomBackground, OSState } from '../types';

interface Props {
  value: string;
  onChange: (mode: string) => void;
  customBackgrounds: CustomBackground[];
  updateState: (updater: (prev: OSState) => OSState) => void;
}

export default function SanctuaryBackgrounds({ value, onChange, customBackgrounds, updateState }: Props) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addBackground = (bgUrl: string, label: string) => {
    const bg: CustomBackground = { id: `custom_${crypto.randomUUID()}`, url: bgUrl, label, createdAt: new Date().toISOString() };
    updateState((s) => ({ ...s, customBackgrounds: [...(s.customBackgrounds ?? []), bg] }));
    onChange(bg.id);
    setAdding(false);
    setUrl('');
    setError(null);
  };

  const applyUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      await measureImage(trimmed);
      addBackground(trimmed, 'My background');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That link could not be used.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const { dataUrl } = await prepareImage(file);
      addBackground(dataUrl, file.name.replace(/\.[a-z0-9]+$/i, '') || 'My background');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be used.');
    } finally {
      setBusy(false);
    }
  };

  const removeBackground = (id: string) => {
    updateState((s) => ({ ...s, customBackgrounds: (s.customBackgrounds ?? []).filter((b) => b.id !== id) }));
    if (value === id) onChange('auto');
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <SwatchButton active={value === 'auto'} label="Auto" sub="Time of day" onClick={() => onChange('auto')} />
        {ATMOSPHERES.map((a) => (
          <SwatchButton key={a.id} active={value === a.id} label={a.name} onClick={() => onChange(a.id)} image={a.backgroundImage} />
        ))}
        {customBackgrounds.map((bg) => (
          <SwatchButton
            key={bg.id}
            active={value === bg.id}
            label={bg.label}
            image={bg.url}
            onClick={() => onChange(bg.id)}
            onDelete={() => removeBackground(bg.id)}
          />
        ))}
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/15 text-white/35 transition-all hover:border-brand-400/40 hover:text-brand-300 cursor-pointer"
        >
          <Plus size={16} />
          <span className="text-[9px] font-bold uppercase tracking-wider">Add</span>
        </button>
      </div>

      {adding && (
        <div className="space-y-2 rounded-2xl border border-brand-400/25 bg-brand-500/5 p-3">
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/12 bg-[#05070c] px-3">
              <Link2 size={13} className="shrink-0 text-white/35" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void applyUrl()}
                placeholder="Paste an image link…"
                className="w-full min-w-0 bg-transparent py-2.5 text-[12.5px] text-white placeholder-white/25 outline-none"
              />
            </div>
            <button
              onClick={() => void applyUrl()}
              disabled={!url.trim() || busy}
              className="shrink-0 rounded-xl bg-brand-500 px-3.5 text-[11px] font-bold text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
            >
              Use
            </button>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] py-2.5 text-[11.5px] font-bold text-white/80 transition-all hover:bg-white/[0.1] disabled:opacity-40 cursor-pointer"
          >
            <Upload size={13} /> Upload from this device
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          {error && <p className="text-[11px] text-red-400/90">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SwatchButton({
  active,
  label,
  sub,
  image,
  onClick,
  onDelete,
}: {
  active: boolean;
  label: string;
  sub?: string;
  image?: string;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        aria-pressed={active}
        className={`relative flex aspect-square w-full flex-col items-end justify-end overflow-hidden rounded-2xl border p-2 text-left transition-all cursor-pointer ${
          active ? 'border-brand-400/60 ring-2 ring-brand-400/30' : 'border-white/10 hover:border-white/25'
        }`}
        style={
          image
            ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(255,255,255,0.03))' }
        }
      >
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        {active && (
          <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-brand-400 p-0.5 text-black">
            <Check size={10} strokeWidth={4} />
          </span>
        )}
        <span className="relative z-10 block w-full truncate text-[9.5px] font-bold uppercase tracking-wide text-white/90">{label}</span>
        {sub && <span className="relative z-10 block text-[8.5px] text-white/50">{sub}</span>}
      </button>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${label}`}
          className="absolute -right-1.5 -top-1.5 z-20 rounded-full bg-black/85 p-1 text-white/70 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 cursor-pointer"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}
