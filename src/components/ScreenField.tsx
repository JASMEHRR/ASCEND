/**
 * Scroll-driven helix of app screens with a halftone dissolve.
 *
 * Image cards ride a descending helix wrapped around a vertical axis: one card
 * forward and crisp while the rest recede, bend around the cylinder, and break
 * into a grid of coloured halftone dots. The only chrome is a split caption —
 * screen name centre-left, description centre-right — and a full-size overlay
 * when a card is clicked.
 *
 * Four things matter here and each is easy to get subtly wrong:
 *
 * 1. It is a real helix, not a scatter. Both x and z come from the same angle
 *    (`x = sin θ · R`, `z = cos θ · R`) so cards genuinely orbit the axis and
 *    pass behind it; `y` descends linearly. Driving only x by the angle gives
 *    a zigzag, not a spiral. The radius and drop scale with the viewport so
 *    the spiral fills the screen instead of huddling in the middle, and the
 *    cull radius is wide enough to keep roughly two turns visible at once —
 *    one turn alone reads as a single arc, not a climbing spiral.
 *
 * 2. Cards are flat, and the image is contain-fitted rather than cover-fitted,
 *    so the whole screenshot is always on screen — cover-fitting is what was
 *    slicing the sides off every capture.
 *
 * 3. Recession is carried by the dither and desaturation, not by opacity.
 *    Fading a card while also dissolving it multiplies two attenuations
 *    together and leaves a smudge with no presence. Opacity stays at 1 until
 *    a short fade at the cull edge purely to stop cards popping out.
 *
 * 4. Nothing about the motion goes through React. Transforms are written
 *    straight to the DOM from a rAF loop that eases a render playhead toward
 *    the scroll position — the easing is what turns a mechanical scroll-to-
 *    transform mapping into something fluid, and it also decouples canvas
 *    repaints from raw scroll frequency. Only the active index goes through
 *    state, and it changes on integer boundaries so re-renders are rare.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useScroll } from 'motion/react';
import { X } from 'lucide-react';

export interface FieldScreen {
  id: string;
  src: string;
  name: string;
  desc: string;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Degrees of revolution per card. At 80° a turn is 4.5 cards, so the visible
 *  span below covers a bit over two turns. */
const ANGLE_STEP = 80;
/** How many index-steps a card stays mounted for. Wide enough that roughly two
 *  turns of the helix are on screen at once. */
const CULL_RADIUS = 5.5;
/** Cards never dissolve past this, so a mounted card always keeps a readable
 *  rectangular silhouette instead of thinning into nothing. */
const MAX_DISSOLVE = 0.86;
/** Index-steps either side of the playhead over which the hero stays fully
 *  crisp before the dissolve begins. Deliberately under half a step: at 0.5
 *  the two cards flanking a midpoint would both be fully crisp and read as
 *  competing heroes rather than one subject. */
const CRISP_HOLD = 0.28;
/** Card box shape. Most of the screenshots are 16:9; the few that are wider
 *  letterbox inside this rather than getting their sides cut off. */
const CARD_ASPECT = 16 / 9;
/** Per-frame easing toward the scroll position. Low enough to feel like the
 *  helix has weight, high enough not to lag behind a deliberate scroll. */
const EASE = 0.16;

/**
 * Detent curve. Smootherstep across each integer gap makes the playhead linger
 * near whole numbers and pass quickly through the halfway point, so the helix
 * rests on a card instead of drifting to a stop between two — which is both
 * the nicer feel and the thing that stops midpoints producing two equally
 * crisp cards with no clear subject.
 */
function detent(pos: number) {
  const base = Math.floor(pos);
  const f = pos - base;
  return base + f * f * f * (f * (f * 6 - 15) + 10);
}

/** Geometry of the helix at the current viewport. Scaled rather than fixed so
 *  the spiral spans the screen on a large display instead of sitting in a
 *  small cluster at the centre. */
function helixMetrics() {
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  return {
    radius: clamp(vw * 0.3, 300, 720),
    // Tall drop per card. A small step stacks consecutive turns on top of each
    // other and the helix reads as one squashed cluster; this is what makes it
    // climb through the full height of the viewport instead.
    yStep: clamp(vh * 0.5, 300, 580),
    cardW: clamp(vw * 0.42, 360, 760),
  };
}

/**
 * Contain-fit: the whole source always lands inside the destination box, so
 * nothing is ever cropped. The previous cover-fit is what was slicing the
 * sides off every screenshot — the card box is 16:9 and two of the captures
 * are 2.21:1, so cover cut them hard.
 */
function containRect(sw: number, sh: number, dw: number, dh: number) {
  const s = Math.min(dw / sw, dh / sh);
  const w = sw * s;
  const h = sh * s;
  return { dx: (dw - w) / 2, dy: (dh - h) / 2, dw: w, dh: h };
}

/** Position and orientation for a card `d` index-steps from the playhead. */
function helixAt(d: number, radius: number, yStep: number) {
  const rad = (d * ANGLE_STEP * Math.PI) / 180;
  return {
    x: Math.sin(rad) * radius,
    // Sits at z=0 on the near face of the cylinder and wraps back to -2R.
    z: Math.cos(rad) * radius - radius,
    y: -d * yStep,
    // Partially tangent: full tangency turns far cards edge-on and hides them,
    // which loses the wrapped-ribbon read.
    rotY: clamp(-d * ANGLE_STEP * 0.45, -52, 52),
  };
}

type DrawFn = (dissolve: number) => void;

/**
 * A card's canvas. Renders the screenshot as a halftone whose dots thin out of
 * the shadows first, then blits the result in slices to bow it around the
 * cylinder. Exposes an imperative draw so the animation loop can repaint it
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
  // the image — on every active-card change.
  onReady: (index: number, draw: DrawFn) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

      const fit = containRect(img.naturalWidth, img.naturalHeight, w, h);

      // Halftone pitch in CSS px. Coarse enough to read as bold dots rather
      // than static once the card is dissolving.
      const grid = clamp(w / 62, 7, 11);
      const cols = Math.max(1, Math.ceil(w / grid));
      const rows = Math.max(1, Math.ceil(h / grid));

      // Sample buffer: the image reduced to one pixel per halftone cell, laid
      // out at the same contain-fit position so the halftone lands exactly
      // where the sharp image does. Letterbox cells stay transparent and are
      // skipped, so the dot field takes the shape of the image itself.
      const sample = sampleRef.current ?? document.createElement('canvas');
      sampleRef.current = sample;
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext('2d', { willReadFrequently: true });
      if (!sctx) return;
      sctx.clearRect(0, 0, cols, rows);
      sctx.drawImage(
        img,
        (fit.dx / w) * cols,
        (fit.dy / h) * rows,
        (fit.dw / w) * cols,
        (fit.dh / h) * rows,
      );

      let data: Uint8ClampedArray | null = null;
      try {
        data = sctx.getImageData(0, 0, cols, rows).data;
      } catch {
        // Tainted canvas — no pixel access, so no halftone is possible.
        data = null;
      }

      const fctx = ctx;

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
          fctx.drawImage(img, fit.dx, fit.dy, fit.dw, fit.dh);
        } else {
          const half = grid / 2;
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const i = (y * cols + x) * 4;
              if (data[i + 3] < 8) continue; // letterbox, nothing to draw
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              // Gamma-lifted luminance. Bright studio photography dissolves
              // beautifully on a raw luminance threshold; our screenshots are
              // dark UI on dark backdrops, which such a threshold erases in
              // one step. Lifting the midtones first is what lets dark content
              // dissolve gradually instead of vanishing.
              const lum = Math.sqrt((r * 0.299 + g * 0.587 + b * 0.114) / 255);
              // Bright cells outlive dark ones, so the image empties out of
              // its shadows first — that reads as dissolving, not fading.
              const survive = lum - step * 0.8;
              if (survive <= 0.015) continue;
              // Dots stay fully opaque and lift toward white as the card
              // recedes, so a receding card reads as a bright halftone slab
              // rather than sinking into the background.
              const lift = 1 + step * 0.7;
              fctx.fillStyle = `rgb(${Math.min(255, r * lift) | 0},${Math.min(255, g * lift) | 0},${Math.min(255, b * lift) | 0})`;
              fctx.beginPath();
              fctx.arc(
                x * grid + half,
                y * grid + half,
                // Dots overlap once they get big, so bright regions fuse into
                // solid slabs instead of staying a scatter of separate specks.
                half * 1.45 * clamp(survive * 3),
                0,
                Math.PI * 2,
              );
              fctx.fill();
            }
          }
        }
      };

      lastStep.current = -1;
      onReady(index, draw);
    };

    img.src = src;
  }, [src, w, h, index, onReady]);

  return <canvas ref={canvasRef} style={{ width: w, height: h }} className="block" />;
}

/** Plain, readable fallback for small screens — a helix of dithered canvases
 *  is too much motion to parse on a phone, and hijacking a tall section there
 *  is more annoying than impressive. Full-colour, undithered, still clickable. */
function MobileList({ screens, onOpen }: { screens: FieldScreen[]; onOpen: (i: number) => void }) {
  return (
    <div className="space-y-4 bg-app px-5 py-14">
      {screens.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onOpen(i)}
          className="block w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] text-left"
        >
          <img src={s.src} alt={s.name} className="block w-full" loading="lazy" />
          <div className="px-4 py-3">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              {String(i + 1).padStart(2, '0')} / {String(screens.length).padStart(2, '0')}
            </p>
            <p className="mt-1 text-[16px] font-extrabold text-white">{s.name}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-white/50">{s.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ScreenField({ screens }: { screens: FieldScreen[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ['start start', 'end end'] });

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drawRefs = useRef<(DrawFn | null)[]>([]);
  const applyRef = useRef<((pos: number) => void) | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  /** Card opened to full size. The helix keeps its scroll position underneath,
   *  so closing returns you exactly where you were. */
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const [metrics, setMetrics] = useState(helixMetrics);
  useEffect(() => {
    const on = () => setMetrics(helixMetrics());
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const cardW = metrics.cardW;
  const cardH = Math.round(cardW / CARD_ASPECT);

  const n = screens.length;

  const registerDraw = useCallback((i: number, draw: DrawFn) => {
    drawRefs.current[i] = draw;
    applyRef.current?.(NaN); // repaint at the current playhead
  }, []);

  // Escape closes the full view.
  useEffect(() => {
    if (openIdx === null) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(null);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [openIdx]);

  // The whole animation. A rAF loop eases a render playhead toward the scroll
  // position and writes transforms straight to the DOM; nothing here touches
  // React except the active index.
  useEffect(() => {
    if (narrow) return;

    const { radius, yStep } = metrics;
    let target = scrollYProgress.get() * Math.max(0, n - 1);
    let render = target;
    let raf = 0;
    let running = false;
    let lastActive = -1;

    const paint = (raw: number) => {
      const pos = detent(raw);
      // Named off the position actually being drawn, so the caption can never
      // disagree with the card that is crisp on screen. The easing settles in
      // well under a fifth of a second, so this still reads as immediate.
      const ai = clamp(Math.round(pos), 0, n - 1);
      if (ai !== lastActive) {
        lastActive = ai;
        setActiveIdx(ai);
      }

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
        // Only the card the caption names takes clicks. A dissolved card is
        // invisible but its canvas box still swallows pointer events, so
        // without this a click on the hero can land on whichever ghost happens
        // to sit above it and open the wrong screen.
        el.style.pointerEvents = i === ai ? 'auto' : 'none';

        const focus = clamp(1 - absD);
        const hx = helixAt(d, radius, yStep);
        // Pull whatever is nearest the playhead toward dead centre and full
        // forward. At 80° per card the raw helix throws even a third-of-a-step
        // offset a long way sideways, so without this the "hero" spends most
        // of the scroll off to one side, crowding the captions and never
        // reading as the subject. The pull falls off fast enough that only the
        // focused card is affected; everything else rides the true helix.
        const pull = Math.exp(-(d * d) / 0.18);
        const k = 1 - pull;
        el.style.transform =
          `translate3d(${(hx.x * k).toFixed(1)}px, ${(hx.y * k).toFixed(1)}px, ${(hx.z * k).toFixed(1)}px) ` +
          `rotateY(${(hx.rotY * k).toFixed(2)}deg)`;
        // Full presence until a short fade at the cull edge, so cards recede by
        // dissolving rather than by quietly going transparent.
        el.style.opacity = String(clamp((CULL_RADIUS - absD) / 0.6));
        // Sort by actual depth, not by focus: focus is 0 for everything a step
        // or more out, which would leave every far card sharing one stacking
        // level and let cards behind the axis paint over cards in front.
        // Normalised into 1..1000 so the whole field stays below the overlay —
        // raw z values ran past the overlay's stacking level and let cards
        // paint straight through the backdrop.
        el.style.zIndex = String(1 + Math.round(clamp(1 + (hx.z * k) / (2 * radius)) * 999));
        // Only the card at the playhead keeps its colour.
        el.style.filter = `grayscale(${clamp((1 - focus) * 1.15).toFixed(2)})`;

        const t = clamp((absD - CRISP_HOLD) / (CULL_RADIUS - CRISP_HOLD));
        drawRefs.current[i]?.(t * MAX_DISSOLVE);
      }
    };

    const tick = () => {
      render += (target - render) * EASE;
      if (Math.abs(target - render) < 0.0006) {
        render = target;
        running = false;
      }
      paint(render);
      if (running) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    // NaN means "no new target, just repaint" — used when a canvas finishes
    // loading after the helix has already settled.
    applyRef.current = (pos: number) => {
      if (!Number.isNaN(pos)) render = pos;
      paint(render);
    };

    paint(render);

    const stop = scrollYProgress.on('change', (p) => {
      target = p * Math.max(0, n - 1);
      start();
    });

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      applyRef.current = null;
      stop();
    };
  }, [scrollYProgress, n, narrow, metrics, cardW, cardH]);

  const active = screens[activeIdx];

  const overlay = (
    <AnimatePresence>
      {openIdx !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setOpenIdx(null)}
          className="bg-app/95 fixed inset-0 z-[2000] flex cursor-zoom-out flex-col items-center justify-center gap-5 p-6 sm:p-10"
        >
          <motion.img
            key={screens[openIdx].id}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            src={screens[openIdx].src}
            alt={screens[openIdx].name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[76vh] w-auto max-w-full cursor-default rounded-xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)]"
          />
          <div className="max-w-xl text-center">
            <p className="text-lg font-extrabold tracking-tight text-white">{screens[openIdx].name}</p>
            <p className="mt-1 text-[13px] leading-snug text-white/55">{screens[openIdx].desc}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpenIdx(null)}
            aria-label="Close"
            className="absolute right-5 top-5 grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/[0.06] text-white/70 transition-colors hover:text-white"
          >
            <X size={17} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (narrow) {
    return (
      <>
        <MobileList screens={screens} onOpen={setOpenIdx} />
        {overlay}
      </>
    );
  }

  return (
    <div ref={wrapRef} style={{ height: `${Math.max(2, n) * 78}vh` }} className="relative">
      <div className="sticky top-0 h-dvh overflow-hidden bg-app">
        <div className="absolute inset-0" style={{ perspective: 1500 }}>
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
                  willChange: 'transform, opacity, filter',
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(i)}
                  aria-label={`Open ${s.name} full size`}
                  className="block cursor-pointer"
                >
                  <DitherCanvas src={s.src} w={cardW} h={cardH} index={i} onReady={registerDraw} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Split caption. Name centre-left, description centre-right, framing
            the helix rather than sitting under it. Pointer-events off so the
            cards stay clickable underneath. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-50 flex w-[34vw] max-w-sm flex-col justify-center pl-8 sm:pl-14">
          <p className="font-mono text-[11px] font-black uppercase tracking-[0.3em] text-white/35">
            {String(activeIdx + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
          </p>
          <p className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-white lg:text-5xl">
            {active?.name}
          </p>
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-0 z-50 flex w-[32vw] max-w-xs flex-col justify-center pr-8 text-right sm:pr-14">
          <p className="text-[14px] leading-relaxed text-white/60">{active?.desc}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-white/25">
            Click to expand
          </p>
        </div>
      </div>

      {overlay}
    </div>
  );
}
