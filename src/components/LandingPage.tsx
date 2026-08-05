/**
 * The pre-login landing page. Shown to a signed-out visitor before the
 * LoginScreen so they know what Ascend actually is before being asked to
 * sign in — real benefit-focused copy plus a big animated product-tour
 * sequence, not just a bare sign-in card or a narrow, sparse pitch.
 *
 * There's no real screen-recorded video and no real screenshots here: the
 * "walkthrough" is a set of detailed in-code animated mockups styled to
 * look like actual app screens (dashboard, Arena, Jarvis chat) — built
 * because there's no way to capture the live signed-in app from this
 * environment. It's the centerpiece of the page, not an afterthought.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
  MessageCircle,
  Swords,
  RefreshCw,
  Target,
  Sparkles,
  ArrowRight,
  Check,
  Droplets,
  Zap,
  BookOpen,
  ShieldCheck,
  BellRing,
  Layers,
  Users,
} from 'lucide-react';
import JarvisOrb from '../features/jarvis/ui/JarvisOrb';

const FEATURES = [
  {
    icon: Flame,
    title: 'Habits & streaks',
    desc: 'Track daily rituals, keep a streak alive, and watch your discipline score move every time you show up.',
  },
  {
    icon: MessageCircle,
    title: 'Jarvis, your AI assistant',
    desc: 'An assistant that can see your whole day — ask it to plan your day, log things, or just check in on how you’re doing.',
  },
  {
    icon: Swords,
    title: 'Arena',
    desc: 'Turn habits into a shared puzzle with friends. Every completion earns tiles toward a picture your whole group builds together.',
  },
  {
    icon: BookOpen,
    title: 'Journal & vision board',
    desc: 'A place to reflect daily and keep the bigger picture in view — what you’re working toward, not just what’s due today.',
  },
  {
    icon: RefreshCw,
    title: 'Everything synced',
    desc: 'Tasks, habits, journal entries, and settings follow you across every device — start on your phone, finish on your laptop.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data, your account',
    desc: 'Sign in once and everything is private to your account. No public feed, no shared visibility beyond the friends you invite into Arena.',
  },
];

/** Why it actually helps, not just what it does. Each gets its own icon and
 *  its own visual weight — three identical cards in a row reads as
 *  template filler, not conviction. */
const BENEFITS = [
  {
    icon: BellRing,
    title: 'You stop relying on willpower alone',
    desc: 'Jarvis notices the day slipping and says something before it’s gone — a nudge instead of a guilt trip at 11pm.',
    big: true,
  },
  {
    icon: Layers,
    title: 'Progress becomes visible',
    desc: 'A streak, a score, a picture filling in tile by tile — habits stop being invisible and start being something you can point to.',
    big: false,
  },
  {
    icon: Users,
    title: 'You’re not doing it alone',
    desc: 'Arena turns solo habit-tracking into something you build with friends — showing up for yourself also shows up for the group.',
    big: false,
  },
];

/** One frame of the animated walkthrough — a fake UI panel styled like the
 *  real app, not a screenshot. */
type TourFrame = {
  id: string;
  eyebrow: string;
  title: string;
  desc: string;
  render: () => React.ReactNode;
};

const TOUR_FRAMES: TourFrame[] = [
  {
    id: 'dashboard',
    eyebrow: 'Home',
    title: 'One screen, your whole day',
    desc: 'Discipline score, streak, open tasks, and today’s habits — the numbers that matter, not a wall of settings.',
    render: () => (
      <div className="w-full space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { icon: Zap, label: 'Discipline', value: '78', sub: '/100', tint: 'text-white' },
            { icon: Flame, label: 'Streak', value: '12', sub: 'days', tint: 'text-amber-400' },
            { icon: Sparkles, label: 'Tasks', value: '3', sub: 'open', tint: 'text-brand-400' },
            { icon: Droplets, label: 'Habits', value: '5/6', sub: 'today', tint: 'text-sky-400' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i }}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
            >
              <p className="flex items-center gap-1 text-[8.5px] font-mono font-bold uppercase tracking-wider text-white/40">
                <s.icon size={10} /> {s.label}
              </p>
              <p className={`mt-1 text-lg font-extrabold ${s.tint}`}>
                {s.value}
                <span className="ml-0.5 text-[9px] font-normal text-white/35">{s.sub}</span>
              </p>
            </motion.div>
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-1.5"
        >
          {['Morning walk', 'Read 20 minutes', 'Drink water'].map((h, i) => (
            <div key={h} className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 + 0.15 * i, type: 'spring', stiffness: 300 }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-400 text-black"
              >
                <Check size={10} strokeWidth={4} />
              </motion.span>
              <span className="text-[11.5px] text-white/70 line-through decoration-white/40">{h}</span>
            </div>
          ))}
        </motion.div>
      </div>
    ),
  },
  {
    id: 'jarvis',
    eyebrow: 'Jarvis',
    title: 'An assistant that actually knows your day',
    desc: 'Not a generic chatbot — Jarvis can see your habits, tasks, and streak, and act on them when you ask.',
    render: () => (
      <div className="flex w-full flex-col items-center gap-4">
        <JarvisOrb state="thinking" size={72} />
        <div className="w-full space-y-2">
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="ml-auto max-w-[80%] rounded-xl border border-brand-400/20 bg-brand-500/15 px-3.5 py-2.5 text-[11.5px] text-white"
          >
            plan my day
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="max-w-[85%] rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-[11.5px] text-white/80"
          >
            You're at a 12-day streak with 1 habit left today. I'll remind you about the pitch deck at 3pm and log
            your water once you confirm.
          </motion.div>
        </div>
      </div>
    ),
  },
  {
    id: 'arena',
    eyebrow: 'Arena',
    title: 'Habits, turned into a group game',
    desc: 'Every habit you complete adds a tile — solo, and to every group puzzle you’re racing in. The picture only finishes if everyone shows up.',
    render: () => (
      <div className="w-full space-y-3">
        <div className="grid grid-cols-8 gap-1 overflow-hidden rounded-xl">
          {Array.from({ length: 32 }).map((_, i) => {
            const filled = i < 21;
            // Per-tile shade variation so the filled area reads as a mosaic
            // picture assembling itself, not one flat block of solid color.
            const shade = 55 + ((i * 37) % 30);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: filled ? 1 : 0.12, scale: 1 }}
                transition={{ delay: 0.015 * i }}
                className="aspect-square"
                style={{
                  background: filled ? `rgba(52, 211, 153, ${shade / 100})` : 'rgba(255,255,255,0.06)',
                }}
              />
            );
          })}
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
        >
          <span className="text-[11px] text-white/60">21 / 32 tiles</span>
          <span className="text-[11px] font-bold text-brand-400">4 players racing</span>
        </motion.div>
      </div>
    ),
  },
  {
    id: 'focus',
    eyebrow: 'Focus',
    title: 'One thing at a time',
    desc: 'A single focus for the day, plus the open tasks around it — not a to-do list you’re afraid to open.',
    render: () => (
      <div className="w-full space-y-2.5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-brand-400/25 bg-brand-500/10 px-3.5 py-3"
        >
          <Target size={16} className="shrink-0 text-brand-400" />
          <span className="text-[13px] font-bold text-white">Ship the pitch deck</span>
        </motion.div>
        {['Call the bank', 'Reply to Sam'].map((t, i) => (
          <motion.div
            key={t}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + 0.1 * i }}
            className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2"
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/25" />
            <span className="text-[11.5px] text-white/65">{t}</span>
          </motion.div>
        ))}
      </div>
    ),
  },
];

const TOUR_INTERVAL_MS = 4200;

function AnimatedWalkthrough() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % TOUR_FRAMES.length), TOUR_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const frame = TOUR_FRAMES[i];

  return (
    <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
      {/* The mockup "screen" */}
      <div className="order-2 lg:order-1">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#05070c]/80 p-6 shadow-[0_40px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.08),_transparent_60%)]" />
          <div className="relative flex min-h-[280px] items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={frame.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
                className="w-full"
              >
                {frame.render()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 lg:justify-start">
          {TOUR_FRAMES.map((f, idx) => (
            <button
              key={f.id}
              onClick={() => setI(idx)}
              aria-label={f.eyebrow}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === i ? 'w-7 bg-brand-400' : 'w-1.5 bg-white/15 hover:bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>

      {/* The description */}
      <div className="order-1 text-left lg:order-2">
        <AnimatePresence mode="wait">
          <motion.div key={frame.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-brand-400">{frame.eyebrow}</p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{frame.title}</h3>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/55">{frame.desc}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function LandingPage({ onContinue }: { onContinue: () => void }) {
  // The signed-in app shell is a fixed-height layout, so `body` is globally
  // locked to overflow-hidden — an overflow-y-auto wrapper alone can't
  // scroll a page taller than the viewport if the body itself refuses to
  // scroll. This page is long, so it needs the lock lifted while it's up,
  // restored on unmount so the real app's fixed layout is unaffected.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-app text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.10),_transparent_55%)]" />

      {/* Hero — full width, centered content */}
      <div className="relative flex flex-col items-center px-6 py-16 text-center sm:py-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
          <JarvisOrb state="idle" size={96} />
        </motion.div>
        <p className="mt-5 text-[11px] font-mono font-black uppercase tracking-[0.32em] text-brand-400">Ascend Protocol</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl">The AI-run life OS.</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-[17px]">
          Habits, goals, and an AI assistant that actually sees your whole day — plus a shared game
          with friends that turns showing up into something you can see grow.
        </p>
        <button
          onClick={onContinue}
          className="mt-8 flex items-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-bold uppercase tracking-wider text-black transition-all hover:bg-brand-400 cursor-pointer"
        >
          Get started <ArrowRight size={15} />
        </button>

        {/* A texture strip, not just white space — echoes the app's own
            dashboard stat cards so the pitch already looks like the product. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-left"
        >
          {[
            { value: '6', label: 'modules in one app' },
            { value: '1', label: 'AI that sees all of them' },
            { value: '∞', label: 'friends you can race in Arena' },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-brand-400">{s.value}</span>
              <span className="text-[12px] text-white/45">{s.label}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Animated walkthrough — the centerpiece, full width */}
      <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <p className="mb-10 flex items-center justify-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-[0.28em] text-white/40">
          <Sparkles size={11} className="text-brand-400" /> See it in motion
        </p>
        <AnimatedWalkthrough />
      </div>

      {/* Benefits — why it helps, not just what it does */}
      <div className="relative border-t border-white/8 bg-white/[0.015] px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-brand-400">Why it works</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">
              Built to change how you actually show up
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: i * 0.08 }}
                className={`flex flex-col justify-between rounded-2xl border p-6 text-left ${
                  b.big
                    ? 'sm:col-span-2 border-brand-400/20 bg-brand-500/[0.06]'
                    : 'border-white/8 bg-white/[0.02]'
                }`}
              >
                <div>
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      b.big ? 'bg-brand-400/15 text-brand-300' : 'bg-white/[0.06] text-white/60'
                    }`}
                  >
                    <b.icon size={18} />
                  </span>
                  <p className={`mt-4 font-bold text-white ${b.big ? 'text-[19px]' : 'text-[16px]'}`}>{b.title}</p>
                  <p className={`mt-2 leading-relaxed text-white/50 ${b.big ? 'text-[14px] max-w-md' : 'text-[13px]'}`}>
                    {b.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Feature grid — full width, 3-across on large screens */}
      <div className="relative px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-brand-400">Everything included</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">One app, not six subscriptions</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: (i % 3) * 0.08 }}
                className="flex flex-col items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                  <Icon size={16} />
                </span>
                <p className="text-[14.5px] font-bold text-white">{title}</p>
                <p className="text-[12.5px] leading-relaxed text-white/50">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA — the orb reappears, closing the loop from the hero
          instead of ending on a generic footer band. */}
      <div className="relative overflow-hidden border-t border-white/8 px-6 py-20 text-center sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(16,185,129,0.10),_transparent_55%)]" />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative">
          <JarvisOrb state="listening" size={64} />
        </motion.div>
        <p className="relative mt-6 text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
          Your protocol starts whenever you're ready.
        </p>
        <p className="relative mt-3 text-[13.5px] text-white/50">Free to use. Sign in with Google or an email — takes about ten seconds.</p>
        <button
          onClick={onContinue}
          className="relative mx-auto mt-8 flex items-center gap-2 rounded-full bg-brand-500 px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-black transition-all hover:bg-brand-400 cursor-pointer"
        >
          Sign in <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
