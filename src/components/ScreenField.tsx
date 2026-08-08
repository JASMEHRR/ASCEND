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
 * thins into the background rather than just fading. Cards more than
 * CULL_RADIUS steps from the playhead unmount entirely instead of sitting
 * around as faint ghosts — that's both what the reference actually looks
 * like (a sparse field, not nine permanently-visible cards) and what keeps
 * the number of live canvases small.
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

/** How many playhead-steps a card stays mounted for. Beyond this it's gone
 *  entirely rather than sitting around as a faint ghost. */
const CULL_RADIUS = 2.6;

/**
 * Position for a card `d` steps from the playhead, on a single continuous
 * spiral arm rather than a flat scatter — this is what actually makes the
 * field read as a spiral instead of a pile of cards: each step twists
 * further around, swings out to a wider radius, and drops in the direction
 * that reads as "coming down toward you" as the index advances. Upcoming
 * cards (d > 0) sit up and back; passed cards (d < 0) sit down and forward,
 * so scrolling forward feels like descending the spiral one turn at a time.
 */
function spiralAt(d: number) {
  const angleDeg = d * -34;
  const radius = 70 + Math.abs(d) * 150;
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * radius,
    y: -d * 150,
    rotY: d * -22,
    rotX: clamp(d * 6, -18, 18),
  };
}

/** Where in the source screenshot the crop window sits — desktop screenshots
 *  are wide, cards are closer to portrait, so this picks the top of the
 *  frame (nav + hero, the part that actually reads at a glance) over the
 *  footer whitespace. */
const FOCUS_Y = 0.22;

function coverRect(sw: number, sh: number, dw: number, dh: number, focusY: number) {
  const srcAspect = sw / sh;
  const dstAspect = dw / dh;
  let cw: number;
  let ch: number;
  if (srcAspect > dstAspect) {
    ch = sh;
    cw = sh * dstAspect;
  } else {
    cw = sw;
    ch = sw / dstAspect;
  }
  const sx = (sw - cw) / 2;
  const sy = clamp((sh - ch) * focusY, 0, sh - ch);
  return { sx, sy, sw: cw, sh: ch };
}

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

    const { sx, sy, sw, sh } = coverRect(img.naturalWidth, img.naturalHeight, w, h, FOCUS_Y);

    // Fully formed: draw the real (cropped) image. Holds for the first couple
    // of quantised steps, not just the exact peak, so the focused card reads
    // as genuinely sharp for a beat rather than a single-pixel-wide instant.
    if (step <= 0.09) {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return;
    }

    // Grid pitch scales with the card so it reads as a bold halftone at any
    // card size instead of turning to static on small cards.
    const grid = clamp(w / 30, 9, 16);
    const cols = Math.max(1, Math.ceil(w / grid));
    const rows = Math.max(1, Math.ceil(h / grid));
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (!octx) return;
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);

    let data: Uint8ClampedArray;
    try {
      data = octx.getImageData(0, 0, cols, rows).data;
    } catch {
      // Tainted canvas (cross-origin image) — fall back to a plain fade.
      ctx.globalAlpha = 1 - step;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return;
    }

    const half = grid / 2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        // Brighter cells hold on longer, so the image thins out of its
        // shadows first — that's what reads as "dissolving" rather than
        // "fading". Softer falloff than a straight subtract keeps mid-tones
        // visible for longer, so a half-dissolved card still reads as an
        // image rather than sparse noise.
        const survive = clamp(1 - step * (1 - lum * 0.6));
        if (survive <= 0.04) continue;
        ctx.fillStyle = `rgba(${r},${g},${b},${clamp(survive * 1.5 + 0.1)})`;
        ctx.beginPath();
        ctx.arc(x * grid + half, y * grid + half, half * 1.3 * clamp(0.5 + survive * 0.85), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [loaded, step, w, h]);

  return <canvas ref={canvasRef} style={{ width: w, height: h }} className="block rounded-[10px]" />;
}

/** Plain, readable fallback for small screens — a 3D field with rotation and
 *  a canvas dissolve per card is a lot of motion to parse on a phone, and
 *  scroll-jacking a tall section there is more annoying than impressive. */
function MobileList({ screens }: { screens: FieldScreen[] }) {
  return (
    <div className="space-y-3 px-5 py-14">
      {screens.map((s, i) => (
        <div key={s.id} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
          <img src={s.src} alt={s.name} className="block aspect-[16/10] w-full object-cover object-top" loading="lazy" />
          <div className="px-4 py-3">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-brand-400">
              {String(i + 1).padStart(2, '0')} / {String(screens.length).padStart(2, '0')}
            </p>
            <p className="mt-1 text-[15px] font-extrabold text-white">{s.name}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-white/50">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
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

  if (narrow) {
    return <MobileList screens={screens} />;
  }

  const cardW = 400;
  const cardH = Math.round(cardW * 0.8);

  return (
    <div ref={wrapRef} style={{ height: `${Math.max(2, n) * 65}vh` }} className="relative">
      <div className="sticky top-0 h-dvh overflow-hidden bg-app">
        {/* The field */}
        <div className="absolute inset-0" style={{ perspective: 1600 }}>
          <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d' }}>
            {screens.map((s, i) => {
              const d = i - pos;
              const absD = Math.abs(d);
              if (absD > CULL_RADIUS) return null;

              const focus = clamp(1 - absD); // 1 at the playhead, 0 by one step away
              const reach = clamp(1 - absD / CULL_RADIUS); // 1 at the playhead, 0 at the cull edge
              const sp = spiralAt(d);
              const x = lerp(sp.x, -70, focus);
              const y = lerp(sp.y, 0, focus);
              const z = lerp(-760, 0, focus);
              const scale = lerp(0.62, 1, focus);
              const rotY = lerp(sp.rotY, 0, focus);
              const rotX = lerp(sp.rotX, 0, focus);
              const dissolve = clamp(1 - focus);
              const opacity = clamp(reach ** 1.3);

              return (
                <div
                  key={s.id}
                  className="absolute"
                  style={{
                    width: cardW,
                    marginLeft: -cardW / 2,
                    marginTop: -cardH / 2,
                    transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${scale})`,
                    opacity,
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
                {on && <span className="absolute inset-y-0 left-full block w-[100vw] bg-white" />}
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
