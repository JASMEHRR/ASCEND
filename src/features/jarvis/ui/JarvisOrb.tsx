import { useEffect, useRef } from 'react';
import { useJarvis } from '../engine/JarvisProvider';

/**
 * The four behavioral states of the Jarvis orb. Each one changes the particle
 * network's density, motion, and glow — not just its colour:
 *  - idle:      sparse network, slow drift, gentle breathing glow.
 *  - listening: denser, nearly still rotation, sonar-like radial swell.
 *  - thinking:  densest, fast rotation with positional jitter, bright links.
 *  - speaking:  mid density, radius modulated in an irregular speech rhythm.
 */
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function orbStateFrom(thinking: boolean, voice: { listening: boolean; speaking: boolean }): OrbState {
  if (voice.listening) return 'listening';
  if (thinking) return 'thinking';
  if (voice.speaking) return 'speaking';
  return 'idle';
}

/** Convenience: derive the orb state straight from the Jarvis engine. */
export function useOrbState(): OrbState {
  const { thinking, voice } = useJarvis();
  return orbStateFrom(thinking, voice);
}

type RGB = [number, number, number];

interface StateParams {
  tint: RGB;
  /** How many of the allocated particles are visible. */
  density: number;
  /** Radians/second of sphere rotation. */
  rotSpeed: number;
  /** Positional noise amplitude (fraction of radius). */
  jitter: number;
  /** Halo glow strength 0..1. */
  glow: number;
  /** Link opacity multiplier. */
  link: number;
}

const STATE_PARAMS: Record<OrbState, StateParams> = {
  idle: { tint: [52, 211, 153], density: 0.5, rotSpeed: 0.12, jitter: 0, glow: 0.45, link: 0.5 },
  listening: { tint: [56, 189, 248], density: 0.68, rotSpeed: 0.05, jitter: 0, glow: 0.6, link: 0.7 },
  thinking: { tint: [167, 139, 250], density: 1, rotSpeed: 0.9, jitter: 0.05, glow: 0.7, link: 1 },
  speaking: { tint: [52, 211, 153], density: 0.62, rotSpeed: 0.25, jitter: 0.02, glow: 0.9, link: 0.65 },
};

const MAX_PARTICLES = 110;
const NEIGHBORS = 2;

/** Evenly distributed unit directions (fibonacci sphere) — computed once. */
const DIRECTIONS: [number, number, number][] = (() => {
  const pts: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const y = 1 - (i / (MAX_PARTICLES - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    pts.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return pts;
})();

/** Static network topology: each particle links to its nearest neighbours. */
const LINKS: [number, number][] = (() => {
  const links = new Set<string>();
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < MAX_PARTICLES; j++) {
      if (i === j) continue;
      const a = DIRECTIONS[i];
      const b = DIRECTIONS[j];
      const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
      dists.push({ j, d });
    }
    dists.sort((x, y) => x.d - y.d);
    for (let k = 0; k < NEIGHBORS; k++) links.add(i < dists[k].j ? `${i}-${dists[k].j}` : `${dists[k].j}-${i}`);
  }
  return [...links].map((s) => s.split('-').map(Number) as [number, number]);
})();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Irregular speech-cadence modulation — a few incommensurate sines. */
const speechWave = (t: number) =>
  0.5 + 0.5 * (0.5 * Math.sin(t * 9.1) + 0.3 * Math.sin(t * 14.7 + 1.3) + 0.2 * Math.sin(t * 5.3 + 2.1));

interface OrbProps {
  state: OrbState;
  /** Diameter in px. The internals scale proportionally. */
  size?: number;
  className?: string;
}

/**
 * A glowing particle-network sphere on canvas — Jarvis's primary visual and
 * state indicator. Parameters (density, rotation, jitter, glow, tint) lerp
 * smoothly between states. Respects prefers-reduced-motion by settling into a
 * slow, low-cost drift.
 */
export default function JarvisOrb({ state, size = 56, className = '' }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const half = size / 2;
    const baseRadius = size * 0.36;
    const persp = size * 1.6;

    // Live params start at the current state's targets and lerp toward them.
    const cur = { ...STATE_PARAMS[stateRef.current], tint: [...STATE_PARAMS[stateRef.current].tint] as RGB };
    let angle = Math.random() * Math.PI * 2;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      const target = STATE_PARAMS[stateRef.current];

      // Smooth parameter transitions between states.
      const k = 1 - Math.exp(-dt * 5);
      cur.density = lerp(cur.density, target.density, k);
      cur.rotSpeed = lerp(cur.rotSpeed, reduceMotion ? 0.03 : target.rotSpeed, k);
      cur.jitter = lerp(cur.jitter, reduceMotion ? 0 : target.jitter, k);
      cur.glow = lerp(cur.glow, target.glow, k);
      cur.link = lerp(cur.link, target.link, k);
      for (let c = 0; c < 3; c++) cur.tint[c] = lerp(cur.tint[c], target.tint[c], k);

      angle += cur.rotSpeed * dt;
      const wobble = Math.sin(t * 0.4) * 0.35;

      // State-driven radius modulation: breath / sonar swell / speech rhythm.
      const s = stateRef.current;
      let radius = baseRadius;
      if (reduceMotion) radius = baseRadius;
      else if (s === 'speaking') radius = baseRadius * (0.94 + 0.12 * speechWave(t));
      else if (s === 'listening') radius = baseRadius * (0.96 + 0.08 * Math.abs(Math.sin(t * 2.2)));
      else if (s === 'thinking') radius = baseRadius * (0.97 + 0.03 * Math.sin(t * 3.1));
      else radius = baseRadius * (0.97 + 0.04 * Math.sin(t * 0.9));

      const [r, g, b] = cur.tint.map(Math.round);
      ctx.clearRect(0, 0, size, size);

      // Halo glow behind the network.
      const halo = ctx.createRadialGradient(half, half, radius * 0.2, half, half, half);
      halo.addColorStop(0, `rgba(${r},${g},${b},${0.28 * cur.glow})`);
      halo.addColorStop(0.7, `rgba(${r},${g},${b},${0.1 * cur.glow})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // Rotate + project every particle.
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const cosW = Math.cos(wobble);
      const sinW = Math.sin(wobble);
      const px = new Float32Array(MAX_PARTICLES);
      const py = new Float32Array(MAX_PARTICLES);
      const pz = new Float32Array(MAX_PARTICLES);
      const active = Math.round(cur.density * MAX_PARTICLES);

      for (let i = 0; i < MAX_PARTICLES; i++) {
        const [dx, dy, dz] = DIRECTIONS[i];
        // Y-axis rotation, then a slow X-axis wobble.
        let x = dx * cosA + dz * sinA;
        let z = -dx * sinA + dz * cosA;
        let y = dy * cosW - z * sinW;
        z = dy * sinW + z * cosW;
        const jit = cur.jitter > 0.001 ? 1 + cur.jitter * Math.sin(t * 11 + i * 2.4) : 1;
        const rad = radius * jit;
        const scale = persp / (persp - z * rad);
        px[i] = half + x * rad * scale;
        py[i] = half + y * rad * scale;
        pz[i] = z; // -1 (back) .. 1 (front)
      }

      // Links first, particles on top.
      ctx.lineWidth = Math.max(0.5, size / 140);
      for (const [i, j] of LINKS) {
        if (i >= active || j >= active) continue;
        const depth = (pz[i] + pz[j]) / 2; // -1..1
        const a = (0.06 + 0.16 * (depth + 1) * 0.5) * cur.link;
        ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        ctx.lineTo(px[j], py[j]);
        ctx.stroke();
      }

      const dotBase = Math.max(0.8, size / 60);
      for (let i = 0; i < active; i++) {
        const depthT = (pz[i] + 1) * 0.5; // 0 back .. 1 front
        const alpha = 0.25 + 0.65 * depthT;
        const dot = dotBase * (0.6 + 0.8 * depthT);
        ctx.fillStyle = `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 70)},${Math.min(255, b + 70)},${alpha})`;
        ctx.beginPath();
        ctx.arc(px[i], py[i], dot, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright nucleus.
      const core = ctx.createRadialGradient(half, half, 0, half, half, radius * 0.32);
      core.addColorStop(0, `rgba(255,255,255,${0.5 * cur.glow})`);
      core.addColorStop(0.4, `rgba(${r},${g},${b},${0.3 * cur.glow})`);
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, size, size);

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div
      className={`relative flex items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Glass shell keeps the orb in the app's liquid-glass language. */}
      <div
        className="absolute inset-0 rounded-full border border-white/12 bg-white/[0.03] backdrop-blur-sm"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}
      />
      <canvas ref={canvasRef} style={{ width: size, height: size }} className="relative" />
    </div>
  );
}
