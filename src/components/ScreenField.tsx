/**
 * Scroll-driven helix of app screens with a halftone dissolve.
 *
 * Faithful to the reference: image cards ride a descending helix wrapped
 * around a vertical axis, one card forward and crisp while the rest recede,
 * bend around the cylinder, and break into a grid of coloured halftone dots.
 * A name index sits bottom-right with the active entry barred in white.
 *
 * Three things matter here and each is easy to get subtly wrong:
 *
 * 1. It is a real helix, not a scatter. Both x and z are driven by the same
 *    angle (`x = sin θ · R`, `z = cos θ · R`) so cards genuinely orbit the
 *    axis and pass behind it; `y` descends linearly with the index. Driving
 *    only x by the angle gives a zigzag, not a spiral.
 *
 * 2. Cards bend. Each canvas is blitted in vertical slices whose height falls
 *    off as cos() across the card, which is what makes a flat rectangle read
 *    as skin on a cylinder rather than a floating billboard.
 *
 * 3. Recession is carried by the dither, not by opacity. Fading a card while
 *    also dissolving it multiplies two attenuations together and leaves a
 *    smudge with no presence; the reference keeps its non-hero cards bright
 *    and hard-edged. Opacity here stays at 1 until a short fade at the cull
 *    edge purely to stop cards popping out of existence.
 *
 * Transforms are written straight to the DOM from a scroll subscription
 * rather than through React state — nine components re-rendering per scroll
 * frame is what makes this kind of effect stutter. Only the active index,
 * which changes on integer boundaries, goes through state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useScroll } from 'motion/react';

export interface FieldScreen {
  id: string;
  src: string;
  name: string;
  desc: string;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Degrees of revolution per card. Across the visible span this carries the
 *  field through roughly a full turn, which is what reads as "spiral". */
const ANGLE_STEP = 52;
/** Radius of the cylinder the cards are wrapped onto, in px. */
const HELIX_RADIUS = 540;
/** Vertical drop per card — the "descending" half of a descending helix.
 *  Wide enough that consecutive turns clear each other instead of stacking
 *  into one another; cards running off the top and bottom of frame is the
 *  reference's look, not a fault. */
const Y_STEP = 265;
/** How many index-steps a card stays mounted for. */
const CULL_RADIUS = 3.2;
/** Total arc the cylindrical bow spans across one card, in radians. Sets how
 *  hard the card's top and bottom edges curve away at its left/right sides. */
const BOW_ARC = 0.9;
/** Vertical slices used for the bow blit. Enough to look continuous, few
 *  enough to stay cheap. */
const BOW_SLICES = 48;
/** Cards never dissolve past this, so a mounted card always keeps a readable
 *  rectangular silhouette instead of thinning into nothing. */
const MAX_DISSOLVE = 0.86;
/** Index-steps either side of the playhead over which the hero stays fully
 *  crisp before the dissolve begins. Deliberately under half a step: at 0.5
 *  the two cards flanking a midpoint would both be fully crisp and read as
 *  competing heroes rather than one subject. */
const CRISP_HOLD = 0.28;

/** Where in the source screenshot the crop window sits — full-page desktop
 *  grabs put the interesting content up top, not in the footer whitespace. */
const FOCUS_Y = 0.2;

function coverRect(sw: number, sh: number, dw: number, dh: number) {
  const dstAspect = dw / dh;
  let cw: number;
  let ch: number;
  if (sw / sh > dstAspect) {
    ch = sh;
    cw = sh * dstAspect;
  } else {
    cw = sw;
    ch = sw / dstAspect;
  }
  return {
    sx: (sw - cw) / 2,
    sy: clamp((sh - ch) * FOCUS_Y, 0, sh - ch),
    sw: cw,
    sh: ch,
  };
}

/** Position and orientation for a card `d` index-steps from the playhead. */
function helixAt(d: number) {
  const rad = (d * ANGLE_STEP * Math.PI) / 180;
  return {
    x: Math.sin(rad) * HELIX_RADIUS,
    // Sits at z=0 on the near face of the cylinder and wraps back to -2R.
    z: Math.cos(rad) * HELIX_RADIUS - HELIX_RADIUS,
    y: -d * Y_STEP,
    // Partially tangent: full tangency turns far cards edge-on and hides
    // them, which loses the wrapped-ribbon read the reference has.
    rotY: clamp(-d * ANGLE_STEP * 0.45, -48, 48),
  };
}

type DrawFn = (dissolve: number) => void;

/**
 * A card's canvas. Renders the screenshot as a halftone whose dots thin out
 * of the shadows first, then blits the result in slices to bow it around the
 * cylinder. Exposes an imperative draw so the scroll loop can repaint it
 * without a React render.
 */
function DitherCanvas({
  src,
  w,
  h,
  index,
  onReady,
}: {
  src: string;
  w: number;
  h: number;
  index: number;
  // Takes the index rather than being pre-bound to it, so the callback can be
  // a stable reference. An inline `d => register(i, d)` would be a new
  // function every render, re-running this effect — and therefore reloading
  // the image and re-firing state — on every active-card change.
  onReady: (index: number, draw: DrawFn) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flatRef = useRef<HTMLCanvasElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const lastStep = useRef(-1);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      // Flat buffer: the un-bowed card, drawn at device resolution.
      const flat = flatRef.current ?? document.createElement('canvas');
      flatRef.current = flat;
      flat.width = canvas.width;
      flat.height = canvas.height;

      const crop = coverRect(img.naturalWidth, img.naturalHeight, w, h);

      // Halftone pitch in CSS px. Coarse enough to read as bold dots rather
      // than static once the card is dissolving.
      const grid = clamp(w / 62, 7, 11);
      const cols = Math.max(1, Math.ceil(w / grid));
      const rows = Math.max(1, Math.ceil(h / grid));

      // Sample buffer: the image reduced to one pixel per halftone cell.
      const sample = sampleRef.current ?? document.createElement('canvas');
      sampleRef.current = sample;
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext('2d', { willReadFrequently: true });
      if (!sctx) return;
      sctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows);

      let data: Uint8ClampedArray | null = null;
      try {
        data = sctx.getImageData(0, 0, cols, rows).data;
      } catch {
        // Tainted canvas — no pixel access, so no halftone is possible.
        data = null;
      }

      const fctx = flat.getContext('2d');
      if (!fctx) return;

      const draw: DrawFn = (dissolve) => {
        // Quantised so a hairline scroll delta doesn't force a full repaint.
        const step = Math.round(clamp(dissolve) * 12) / 12;
        if (step === lastStep.current) return;
        lastStep.current = step;

        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fctx.clearRect(0, 0, w, h);

        if (step <= 0.04 || !data) {
          // The hero card, or a cross-origin image we can't sample: draw the
          // real thing so the focused screen is genuinely sharp.
          fctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
        } else {
          const half = grid / 2;
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const i = (y * cols + x) * 4;
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              // Gamma-lifted luminance. The reference dissolves bright studio
              // photography; our screenshots are dark UI on dark backdrops, so
              // a raw luminance threshold erases a whole card at once. Lifting
              // the midtones first is what lets dark content dissolve
              // gradually instead of vanishing.
              const lum = Math.sqrt((r * 0.299 + g * 0.587 + b * 0.114) / 255);
              // Bright cells outlive dark ones, so the image empties out of
              // its shadows first — that reads as dissolving, not fading.
              const survive = lum - step * 0.8;
              if (survive <= 0.015) continue;
              // Dots stay fully opaque, and lift toward white as the card
              // recedes, so a receding card reads as a bright halftone slab
              // like the reference rather than sinking into the background.
              const lift = 1 + step * 0.7;
              fctx.fillStyle = `rgb(${Math.min(255, r * lift) | 0},${Math.min(255, g * lift) | 0},${Math.min(255, b * lift) | 0})`;
              fctx.beginPath();
              fctx.arc(
                x * grid + half,
                y * grid + half,
                // Dots overlap once they get big, so bright regions fuse into
                // solid slabs the way the reference's do instead of staying a
                // scatter of separate specks.
                half * 1.45 * clamp(survive * 3),
                0,
                Math.PI * 2,
              );
              fctx.fill();
            }
          }
        }

        // Bow the flat card around the cylinder: each vertical slice loses
        // height as cos() away from the card's centre line.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sliceW = canvas.width / BOW_SLICES;
        for (let i = 0; i < BOW_SLICES; i++) {
          const u = (i + 0.5) / BOW_SLICES;
          const dh = canvas.height * Math.cos((u - 0.5) * BOW_ARC);
          ctx.drawImage(
            flat,
            i * sliceW,
            0,
            sliceW,
            canvas.height,
            i * sliceW,
            (canvas.height - dh) / 2,
            sliceW + 1,
            dh,
          );
        }
      };

      lastStep.current = -1;
      onReady(index, draw);
    };

    img.src = src;
  }, [src, w, h, index, onReady]);

  return <canvas ref={canvasRef} style={{ width: w, height: h }} className="block" />;
}

/** Plain, readable fallback for small screens — a helix of dithered cards is
 *  a lot of motion to parse on a phone, and hijacking a tall section there is
 *  more annoying than impressive. */
function MobileList({ screens }: { screens: FieldScreen[] }) {
  return (
    <div className="space-y-3 px-5 py-14">
      {screens.map((s, i) => (
        <div key={s.id} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
          <img
            src={s.src}
            alt={s.name}
            className="block aspect-[16/10] w-full object-cover object-top"
            loading="lazy"
          />
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

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drawRefs = useRef<(DrawFn | null)[]>([]);
  // Images finish loading well after the first layout pass, so a canvas that
  // has just registered needs the current scroll position pushed back into it
  // — otherwise it keeps whatever it painted on load and never updates until
  // the next scroll event, which on a stationary page is never.
  const applyRef = useRef<((p: number) => void) | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Cards are sized off the viewport so the hero holds roughly the same share
  // of the screen the reference gives it (~36% wide) at any window size.
  const [cardW, setCardW] = useState(() =>
    typeof window === 'undefined' ? 580 : clamp(window.innerWidth * 0.38, 360, 620),
  );
  useEffect(() => {
    const on = () => setCardW(clamp(window.innerWidth * 0.38, 360, 620));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const cardH = Math.round(cardW * 0.57);

  const n = screens.length;

  const registerDraw = useCallback(
    (i: number, draw: DrawFn) => {
      drawRefs.current[i] = draw;
      applyRef.current?.(scrollYProgress.get());
    },
    [scrollYProgress],
  );

  // The whole animation: positions written straight to the DOM, canvases
  // repainted only when their quantised dissolve actually changes.
  useEffect(() => {
    if (narrow) return;

    let lastActive = -1;
    const apply = (p: number) => {
      const pos = p * Math.max(0, n - 1);

      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const d = i - pos;
        const absD = Math.abs(d);

        if (absD > CULL_RADIUS) {
          el.style.visibility = 'hidden';
          continue;
        }
        el.style.visibility = 'visible';

        const focus = clamp(1 - absD);
        const hx = helixAt(d);
        el.style.transform =
          `translate3d(${hx.x.toFixed(1)}px, ${hx.y.toFixed(1)}px, ${hx.z.toFixed(1)}px) ` +
          `rotateY(${hx.rotY.toFixed(2)}deg)`;
        // Full presence until a short fade at the cull edge, so cards recede
        // by dissolving rather than by quietly going transparent.
        el.style.opacity = String(clamp((CULL_RADIUS - absD) / 0.5));
        el.style.zIndex = String(Math.round(focus * 100));

        // Hold the hero fully crisp for a half-step either side of the
        // playhead before the dissolve starts, then spread the rest across
        // the visible span. Without the flat plateau the only crisp moment is
        // the exact integer position, so between cards the screen is nothing
        // but halftone mud — which is what a visitor scrolling at any normal
        // speed would actually see.
        const t = clamp((absD - CRISP_HOLD) / (CULL_RADIUS - CRISP_HOLD));
        drawRefs.current[i]?.(t * MAX_DISSOLVE);
      }

      const ai = clamp(Math.round(pos), 0, n - 1);
      if (ai !== lastActive) {
        lastActive = ai;
        setActiveIdx(ai);
      }
    };

    applyRef.current = apply;
    apply(scrollYProgress.get());
    const stop = scrollYProgress.on('change', apply);
    return () => {
      applyRef.current = null;
      stop();
    };
  }, [scrollYProgress, n, narrow, cardW, cardH]);

  if (narrow) return <MobileList screens={screens} />;

  return (
    <div ref={wrapRef} style={{ height: `${Math.max(2, n) * 70}vh` }} className="relative">
      <div className="sticky top-0 h-dvh overflow-hidden bg-app">
        <div className="absolute inset-0" style={{ perspective: 1200 }}>
          <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d' }}>
            {screens.map((s, i) => (
              <div
                key={s.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className="absolute"
                style={{
                  width: cardW,
                  height: cardH,
                  marginLeft: -cardW / 2,
                  marginTop: -cardH / 2,
                  willChange: 'transform, opacity',
                }}
              >
                <DitherCanvas src={s.src} w={cardW} h={cardH} index={i} onReady={registerDraw} />
              </div>
            ))}
          </div>
        </div>

        {/* Name index, bottom-right. The bar running off the right edge is
            what makes it read as an index rather than a list of buttons. */}
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
