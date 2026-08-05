/**
 * The pre-login landing page. Shown to a signed-out visitor before the
 * LoginScreen so they know what Ascend actually is before being asked to
 * sign in — a real explanation with a feature grid and an animated
 * product-tour sequence, not just a bare sign-in card.
 *
 * There's no real screen-recorded video here: the "walkthrough" is an
 * in-code animated mockup that cycles through a few fake UI panels
 * (habits → Jarvis → Arena), which reads as a product tour without
 * depending on an external video file.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, MessageCircle, Swords, RefreshCw, Target, Sparkles, ArrowRight, Check } from 'lucide-react';
import JarvisOrb from '../features/jarvis/ui/JarvisOrb';

const FEATURES = [
  {
    icon: Flame,
    title: 'Habits & streaks',
    desc: 'Track daily rituals, keep a streak going, and see your discipline score move as you go.',
  },
  {
    icon: MessageCircle,
    title: 'Jarvis, your AI assistant',
    desc: 'An assistant that can see your whole day — ask it to plan your day, log things, or just check in.',
  },
  {
    icon: Swords,
    title: 'Arena',
    desc: 'Turn habits into a shared puzzle with friends — every completion earns tiles toward a group picture.',
  },
  {
    icon: RefreshCw,
    title: 'Everything synced',
    desc: 'Tasks, journal, vision board, and more — all in one place, synced across every device you use.',
  },
];

/** One frame of the animated walkthrough — a fake UI panel, not a real screenshot. */
type TourFrame = {
  id: string;
  label: string;
  render: () => React.ReactNode;
};

const TOUR_FRAMES: TourFrame[] = [
  {
    id: 'habits',
    label: 'Check off a habit',
    render: () => (
      <div className="w-full max-w-xs space-y-2">
        {['Morning walk', 'Read 20 minutes', 'Drink water'].map((h, i) => (
          <motion.div
            key={h}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 * i }}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
          >
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 + 0.15 * i, type: 'spring', stiffness: 300 }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-black"
            >
              <Check size={12} strokeWidth={4} />
            </motion.span>
            <span className="text-[12.5px] text-white/80 line-through decoration-white/40">{h}</span>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    id: 'jarvis',
    label: 'Ask Jarvis anything',
    render: () => (
      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <JarvisOrb state="thinking" size={56} />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full rounded-xl border border-brand-400/20 bg-brand-500/10 px-3.5 py-2.5 text-[12px] text-white/70"
        >
          "You're at a 6-day streak, and 2 tasks are still open. Want me to plan the rest of today?"
        </motion.div>
      </div>
    ),
  },
  {
    id: 'arena',
    label: 'Race friends in Arena',
    render: () => (
      <div className="grid w-full max-w-xs grid-cols-6 gap-1">
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: i < 16 ? 1 : 0.15, scale: 1 }}
            transition={{ delay: 0.02 * i }}
            className={`aspect-square rounded-sm ${i < 16 ? 'bg-brand-400/70' : 'bg-white/10'}`}
          />
        ))}
      </div>
    ),
  },
  {
    id: 'focus',
    label: "Set today's focus",
    render: () => (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full max-w-xs items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3"
      >
        <Target size={16} className="shrink-0 text-brand-400" />
        <span className="text-[12.5px] font-semibold text-white/85">Ship the pitch deck</span>
      </motion.div>
    ),
  },
];

const TOUR_INTERVAL_MS = 3200;

function AnimatedWalkthrough() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % TOUR_FRAMES.length), TOUR_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const frame = TOUR_FRAMES[i];

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.02] p-8 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.08),_transparent_60%)]" />
        <div className="relative flex min-h-[220px] flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={frame.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="flex w-full flex-col items-center gap-4"
            >
              {frame.render()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        {TOUR_FRAMES.map((f, idx) => (
          <button
            key={f.id}
            onClick={() => setI(idx)}
            aria-label={f.label}
            className={`h-1.5 rounded-full transition-all cursor-pointer ${
              idx === i ? 'w-6 bg-brand-400' : 'w-1.5 bg-white/15 hover:bg-white/30'
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/40">{frame.label}</p>
    </div>
  );
}

export default function LandingPage({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="relative min-h-screen w-full overflow-y-auto bg-app text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.10),_transparent_55%)]" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center sm:py-24">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
          <JarvisOrb state="idle" size={96} />
        </motion.div>
        <p className="mt-5 text-[11px] font-mono font-black uppercase tracking-[0.32em] text-brand-400">Ascend Protocol</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
          The AI-run life OS.
        </h1>
        <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-white/55 sm:text-[15px]">
          Habits, goals, and an AI assistant that actually sees your whole day — plus a shared game
          with friends that turns showing up into something you can see grow.
        </p>
        <button
          onClick={onContinue}
          className="mt-7 flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold uppercase tracking-wider text-black transition-all hover:bg-brand-400 cursor-pointer"
        >
          Get started <ArrowRight size={15} />
        </button>

        {/* Feature grid */}
        <div className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                <Icon size={16} />
              </span>
              <p className="text-[14px] font-bold text-white">{title}</p>
              <p className="text-[12.5px] leading-relaxed text-white/50">{desc}</p>
            </div>
          ))}
        </div>

        {/* Animated walkthrough */}
        <div className="mt-20 w-full">
          <p className="mb-6 flex items-center justify-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-[0.28em] text-white/40">
            <Sparkles size={11} className="text-brand-400" /> See it in motion
          </p>
          <AnimatedWalkthrough />
        </div>

        {/* Final CTA */}
        <div className="mt-20 flex flex-col items-center gap-3">
          <p className="text-[15px] font-bold text-white">Ready to start your protocol?</p>
          <button
            onClick={onContinue}
            className="flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/15 px-6 py-3 text-sm font-bold uppercase tracking-wider text-brand-300 transition-all hover:bg-brand-500/25 cursor-pointer"
          >
            Sign in <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
