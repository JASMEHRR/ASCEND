import { motion } from 'motion/react';
import { useJarvis } from '../engine/JarvisProvider';

/**
 * The four behavioral states of the Jarvis orb. Each one has a genuinely
 * different motion signature (not just a colour swap):
 *  - idle:      slow breathing core + a lazy drifting halo.
 *  - listening: sonar — rings ripple outward from the core while it holds still.
 *  - thinking:  orbital — particles and a dashed ring sweep around the core.
 *  - speaking:  waveform — the core pulses in a quick, irregular speech rhythm.
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

const STATE_TINT: Record<OrbState, string> = {
  idle: 'rgba(52,211,153,0.55)', // brand emerald
  listening: 'rgba(56,189,248,0.6)', // sky — "I'm hearing you"
  thinking: 'rgba(167,139,250,0.6)', // violet — processing
  speaking: 'rgba(52,211,153,0.75)', // brand, brighter
};

interface OrbProps {
  state: OrbState;
  /** Diameter in px. The internals scale proportionally. */
  size?: number;
  className?: string;
}

/**
 * The Cortana-inspired Jarvis orb. Pure divs + motion — no canvas — so it
 * stays cheap, themable, and consistent with the liquid-glass language.
 */
export default function JarvisOrb({ state, size = 56, className = '' }: OrbProps) {
  const tint = STATE_TINT[state];
  const core = size * 0.44;

  return (
    <div
      className={`relative flex items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Glass shell */}
      <div
        className="absolute inset-0 rounded-full border border-white/15 bg-white/[0.05] backdrop-blur-xl"
        style={{ boxShadow: `0 0 ${size * 0.45}px ${tint.replace(/0\.\d+\)/, '0.28)')}, inset 0 1px 0 rgba(255,255,255,0.12)` }}
      />

      {/* Idle: lazy halo drifting around the shell */}
      {state === 'idle' && (
        <motion.span
          className="absolute rounded-full border"
          style={{ inset: size * 0.08, borderColor: tint, borderTopColor: 'transparent', borderLeftColor: 'transparent', opacity: 0.35 }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
        />
      )}

      {/* Listening: sonar rings rippling outward */}
      {state === 'listening' &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={`sonar-${i}`}
            className="absolute rounded-full border-2"
            style={{ inset: size * 0.18, borderColor: tint }}
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.6, ease: 'easeOut' }}
          />
        ))}

      {/* Thinking: dashed sweep + two counter-orbiting particles */}
      {state === 'thinking' && (
        <>
          <motion.span
            className="absolute rounded-full"
            style={{
              inset: size * 0.1,
              border: `1.5px dashed ${tint}`,
              opacity: 0.55,
            }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
          />
          {[0, 180].map((deg) => (
            <motion.span
              key={`orbit-${deg}`}
              className="absolute inset-0"
              initial={{ rotate: deg }}
              animate={{ rotate: deg + 360 }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
            >
              <span
                className="absolute left-1/2 -translate-x-1/2 rounded-full"
                style={{ top: size * 0.04, width: size * 0.09, height: size * 0.09, background: tint, filter: 'blur(0.5px)' }}
              />
            </motion.span>
          ))}
        </>
      )}

      {/* Speaking: fast glow ring in a speech-like cadence */}
      {state === 'speaking' && (
        <motion.span
          className="absolute rounded-full border-2"
          style={{ inset: size * 0.12, borderColor: tint }}
          animate={{ scale: [1, 1.12, 1.04, 1.16, 1], opacity: [0.7, 0.4, 0.65, 0.35, 0.7] }}
          transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }}
        />
      )}

      {/* Core — its motion also differs per state */}
      <motion.span
        key={state} // restart the keyframe loop when behaviour changes
        className="relative rounded-full"
        style={{
          width: core,
          height: core,
          background: `radial-gradient(circle at 32% 30%, rgba(255,255,255,0.85), ${tint} 55%, rgba(2,4,10,0.9))`,
          boxShadow: `0 0 ${core * 0.9}px ${tint}`,
        }}
        animate={
          state === 'speaking'
            ? { scale: [1, 1.22, 1.08, 1.28, 1.05, 1] } // irregular speech rhythm
            : state === 'listening'
              ? { scale: [1, 1.05, 1] } // attentive, nearly still
              : state === 'thinking'
                ? { scale: [1, 0.92, 1] } // contracting concentration
                : { scale: [1, 1.07, 1] } // slow idle breath
        }
        transition={{
          repeat: Infinity,
          duration: state === 'speaking' ? 0.8 : state === 'thinking' ? 1.3 : state === 'listening' ? 1.6 : 3.6,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}
