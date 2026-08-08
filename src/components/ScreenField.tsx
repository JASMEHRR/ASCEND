/**
 * Scroll-driven 3D field of app screens with a halftone dissolve.
 *
 * Modelled on the reference: cards float at varying depths against black, one
 * forward and crisp while the rest recede and break apart into a grid of
 * coloured dots. A name list sits bottom-right with the active entry barred
 * in white. Scrolling the (tall) section moves a continuous playhead through
 * the screens, so the field turns and re-forms as you go.
 *
 * The dissolve is real pixel work, not a CSS filter: each card samples its own
 * image down to a coarse grid and redraws it as dots whose radius falls off
 * with the dissolve amount, so bright areas survive longest and the image
 * thins into the background rather than just fading.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';

export interface FieldScreen {
  id: string;
  src: string;
  name: string;
  desc: string;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/**
 * Where each card rests when it is NOT the active one. Deterministic rather
 * than random so the field looks composed instead of noisy, and so it doesn't
 * reshuffle on every render.
 */
const SCATTER = [
  { x: -0.30, y: -0.30 },
  { x: 0.32, y: -0.20 },
  { x: -0.36, y: 0.24 },
  { x: 0.28, y: 0.30 },
  { x: -0.10, y: -0.38 },
  { x: 0.40, y: 0.04 },
  { x: -0.42, y: -0.02 },
  { x: 0.12, y: 0.38 },
  { x: -0.18, y: 0.12 },
  { x: 0.20, y: -0.34 },
];

/** Grid pitch of the halftone, in CSS px. Smaller = finer dots, more work. */
const GRID = 5;

function DitherCanvas({ src, dissolve, w, h }: { src: string; dissolve: number; w: number; h: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  // Quantised so a tiny scroll delta doesn't force a full redraw every frame.
  const step = Math.round(dissolve * 16) / 16;

  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Fully formed: draw the real image, so the focused card stays sharp.
    if (step <= 0.02) {
      ctx.drawImage(img, 0, 0, w, h);
      return;
    }

    const cols = Math.max(1, Math.ceil(w / GRID));
    const rows = Math.max(1, Math.ceil(h / GRID));
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (!octx) return;
    octx.drawImage(img, 0, 0, cols, rows);

    let data: Uint8ClampedArray;
    try {
      data = octx.getImageData(0, 0, cols, rows).data;
    } catch {
      // Tainted canvas (cross-origin image) — fall back to a plain fade.
      ctx.globalAlpha = 1 - step;
      ctx.drawImage(img, 0, 0, w, h);
      return;
    }

    const half = GRID / 2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        // Brighter cells hold on longer, so the image thins out of its
        // shadows first — that's what reads as "dissolving" rather than
        // "fading".
        const survive = lum - step * 1.15;
        if (survive <= 0.02) continue;
        ctx.fillStyle = `rgba(${r},${g},${b},${clamp(survive * 1.7)})`;
        ctx.beginPath();
        ctx.arc(x * GRID + half, y * GRID + half, half * 1.25 * clamp(survive * 1.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [loaded, step, w, h]);

  return <canvas ref={canvasRef} style={{ width: w, height: h }} className="block rounded-[10px]" />;
}

export default function ScreenField({ screens }: { screens: FieldScreen[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ['start start', 'end end'] });
  const [head, setHead] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', setHead);

  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const n = screens.length;
  // Continuous playhead across the screens; cards react to their distance
  // from it, so transitions are a gradient rather than a hard swap.
  const pos = head * Math.max(0, n - 1);
  const activeIdx = Math.min(n - 1, Math.max(0, Math.round(pos)));

  const cardW = narrow ? 260 : 430;
  const cardH = Math.round(cardW * 0.5);
  const spread = narrow ? 300 : 620;

  return (
    <div ref={wrapRef} style={{ height: `${Math.max(2, n) * 90}vh` }} className="relative">
      <div className="sticky top-0 h-dvh overflow-hidden bg-app">
        {/* The field */}
        <div className="absolute inset-0" style={{ perspective: narrow ? 900 : 1500 }}>
          <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d' }}>
            {screens.map((s, i) => {
              const d = i - pos;
              const focus = clamp(1 - Math.abs(d)); // 1 at the playhead
              const sc = SCATTER[i % SCATTER.length];
              const x = lerp(sc.x * spread, narrow ? 0 : -60, focus);
              const y = lerp(sc.y * spread * 0.62, 0, focus);
              const z = lerp(-620, 0, focus);
              const scale = lerp(0.7, 1, focus);
              const dissolve = clamp(1 - focus);
              return (
                <div
                  key={s.id}
                  className="absolute"
                  style={{
                    width: cardW,
                    marginLeft: -cardW / 2,
                    marginTop: -cardH / 2,
                    transform: `translate3d(${x}px, ${y}px, ${z}px) scale(${scale})`,
                    opacity: clamp(0.12 + focus * 0.88),
                    zIndex: Math.round(focus * 100),
                    transition: 'transform 220ms linear, opacity 220ms linear',
                  }}
                >
                  <div
                    className="overflow-hidden rounded-xl"
                    style={{
                      boxShadow: focus > 0.6 ? '0 40px 90px -20px rgba(0,0,0,0.9)' : 'none',
                    }}
                  >
                    <DitherCanvas src={s.src} dissolve={dissolve} w={cardW} h={cardH} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Name index, bottom-right. The bar runs to the edge like the
            reference, which is what makes it read as an index rather than a
            list of buttons. */}
        <div className="absolute bottom-6 right-0 z-50 w-[min(60vw,15rem)] sm:bottom-10">
          {screens.map((s, i) => {
            const on = i === activeIdx;
            return (
              <div key={s.id} className="relative">
                <p
                  className={`pl-3 pr-4 text-[12px] font-bold leading-[1.55] transition-colors sm:text-[13px] ${
                    on ? 'bg-white text-black' : 'text-white/55'
                  }`}
                >
                  {s.name}
                </p>
                {on && <span className="absolute inset-y-0 left-full block w-screen bg-white" />}
              </div>
            );
          })}
        </div>

        {/* What the focused screen actually is. */}
        <motion.div
          key={screens[activeIdx]?.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-8 left-6 z-50 max-w-xs sm:bottom-12 sm:left-10"
        >
          <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-brand-400">
            {String(activeIdx + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
          </p>
          <p className="mt-2 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            {screens[activeIdx]?.name}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-white/50">{screens[activeIdx]?.desc}</p>
        </motion.div>
      </div>
    </div>
  );
}
