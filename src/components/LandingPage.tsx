/**
 * The pre-login landing page. Shown to a signed-out visitor before the
 * LoginScreen so they know what Ascend actually is before being asked to
 * sign in — real benefit-focused copy and real screenshots, not a bare
 * sign-in card or a narrow, sparse pitch.
 *
 * Every panel here uses the app's actual liquid-glass-panel/highlight
 * classes (see index.css) instead of generic bordered boxes, so the pitch
 * already looks and feels like the real product, not a template.
 *
 * The product is shown twice, and only with real captures: once in the hero,
 * where the dashboard sits under the CTA cropped by the fold so a visitor
 * sees the app inside the first screen, and once in the scroll-driven screen
 * field below. An earlier version also carried a coded animated-mockup
 * carousel above the field. It was cut because it did the same job as the
 * field with fake screens, and the real captures win that comparison.
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Flame,
  MessageCircle,
  Swords,
  RefreshCw,
  ArrowRight,
  BookOpen,
  ShieldCheck,
  BellRing,
  Layers,
  Users,
  Wand2,
  Mail,
  LineChart,
} from 'lucide-react';
import JarvisOrb from '../features/jarvis/ui/JarvisOrb';
import ScreenField, { type FieldScreen } from './ScreenField';
import { FEATURES as FEATURES_REGISTRY } from '../features/registry';

/**
 * Real captures of the running app, in the order the field walks through
 * them. Deliberately starts on the dashboard (what you see every day) and
 * ends on Connections (the "it plugs into my life" moment).
 */
const FIELD_SCREENS: FieldScreen[] = [
  {
    id: 'dashboard',
    src: '/screens/field/dashboard.jpg',
    name: 'Dashboard',
    desc: 'Discipline, streak, open tasks and today’s habits — the whole day on one screen.',
  },
  {
    id: 'jarvis',
    src: '/screens/field/jarvis.jpg',
    name: 'Jarvis',
    desc: 'An assistant that can already see your day, and acts on it when you ask.',
  },
  {
    id: 'habits',
    src: '/screens/field/habits.jpg',
    name: 'Habits',
    desc: 'Your rituals, each one private or visible to the room as you choose.',
  },
  {
    id: 'puzzle',
    src: '/screens/field/puzzle.jpg',
    name: 'Puzzle',
    desc: 'Every habit you complete places a piece. The picture only finishes if you keep showing up.',
  },
  {
    id: 'rooms',
    src: '/screens/field/rooms.jpg',
    name: 'Arena rooms',
    desc: 'Start a room or join with a code. Everyone keeps their own habits; the room sees who showed up.',
  },
  {
    id: 'modules',
    src: '/screens/field/modules.jpg',
    name: 'My Modules',
    desc: 'Trackers, counters and charts you asked Jarvis for — built on request, no coding.',
  },
  {
    id: 'settings-modules',
    src: '/screens/field/settings-modules.jpg',
    name: 'Modules',
    desc: 'Turn any part of the app on or off. What you don’t use never appears.',
  },
  {
    id: 'appearance',
    src: '/screens/field/appearance.jpg',
    name: 'Appearance',
    desc: 'Glass, blur and the sanctuary atmosphere behind everything — including your own photos.',
  },
  {
    id: 'connections',
    src: '/screens/field/connections.jpg',
    name: 'Connections',
    desc: 'Google, Obsidian and Zerodha Kite. Read-only, and the access stays in your browser.',
  },
];

/**
 * The modules that actually ship, straight from the registry.
 *
 * The hero claimed "9 connected modules" as a hand-typed number and never said
 * what they were — a claim a visitor has no reason to believe. Deriving both
 * the count and the names from FEATURES means the page cannot drift from the
 * product: add a module and the pitch updates itself.
 */
const SHIPPED_MODULES = FEATURES_REGISTRY.filter((m) => m.status === 'active' && m.nav);

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
    icon: Wand2,
    title: 'Jarvis builds you modules',
    desc: 'Ask for a tracker, counter, checklist, or chart in plain English and Jarvis builds it into your dashboard on the spot — no settings menu required.',
  },
  {
    icon: Swords,
    title: 'Arena',
    desc: 'Turn habits into a shared puzzle with friends. Every completion earns tiles toward a picture your whole group builds together.',
  },
  {
    icon: LineChart,
    title: 'Live brokerage data',
    desc: 'Connect Kite and Jarvis can see your real holdings and portfolio — ask "how am I doing" and get an actual answer, not a guess.',
  },
  {
    icon: Mail,
    title: 'Gmail & Obsidian, connected',
    desc: 'Jarvis can read your inbox and write straight into your Obsidian vault — your existing tools stay in the loop instead of getting replaced.',
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
  },
  {
    icon: Layers,
    title: 'Progress becomes visible',
    desc: 'A streak, a score, a picture filling in tile by tile — habits stop being invisible and start being something you can point to.',
  },
  {
    icon: Users,
    title: 'You’re not doing it alone',
    desc: 'Arena turns solo habit-tracking into something you build with friends — showing up for yourself also shows up for the group.',
  },
];

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

  // The orb is the tallest single thing above the headline, so it shrinks on a
  // phone. A number, not a CSS class — JarvisOrb sizes its canvas from a prop.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const heroOrb = narrow ? 62 : 88;

  return (
    // overflow-x-clip, NOT overflow-x-hidden: `hidden` turns this into a
    // scroll container, which silently breaks position:sticky on every
    // descendant — including the helix's sticky viewport, whose whole
    // animation depends on it. `clip` stops horizontal overflow without
    // creating a scroll container, so sticky keeps working.
    <div className="relative min-h-dvh w-full overflow-x-clip bg-app text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.10),_transparent_55%)]" />

      {/* Hero — full width, centered content, ending on a real screenshot
          that the fold cuts through. Padding is deliberately tighter than a
          typical hero: the screenshot has to start above the fold to do its
          job, and every pixel spent above it pushes it under. */}
      {/* Phone spacing is tighter throughout this block: at 375px the original
          rhythm pushed the CTA to the bottom of the first screen and the
          product shot entirely off it, so the visitor's first impression was
          a sentence and a lot of dark space. */}
      <div className="relative flex flex-col items-center px-6 pt-8 text-center sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
          <JarvisOrb state="idle" size={heroOrb} />
        </motion.div>
        <p className="mt-3.5 text-[11px] font-mono font-black uppercase tracking-[0.32em] text-brand-400 sm:mt-5">Ascend Protocol</p>
        <h1 className="mt-2.5 max-w-4xl text-[2rem] font-extrabold tracking-tight sm:mt-3 sm:text-6xl">The AI-run life OS.</h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/55 sm:mt-4 sm:text-[17px]">
          Habits, goals, and an AI assistant that actually sees your whole day, builds you new tools on
          request, and connects to the accounts you already use — plus a shared game with friends that
          turns showing up into something you can see grow.
        </p>

        <div className="mt-5 flex flex-col items-center gap-4 sm:mt-7 sm:flex-row sm:gap-8">
          <button
            onClick={onContinue}
            className="flex shrink-0 items-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-bold uppercase tracking-wider text-black transition-all hover:bg-brand-400 cursor-pointer"
          >
            Get started <ArrowRight size={15} />
          </button>

          {/* The stat strip sits beside the CTA rather than under it. As its
              own full-width band it cost about 90px of vertical space, which
              is most of what the screenshot below needs to clear the fold. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            // Desktop only. Beside the CTA it costs nothing, but on a phone it
            // stacks into three rows (~138px) and repeats what the named module
            // list directly below already proves better.
            className="liquid-glass-panel hidden flex-wrap items-center justify-center gap-x-7 gap-y-3 rounded-2xl px-6 py-3.5 text-left sm:flex"
          >
            {[
              { value: String(SHIPPED_MODULES.length), label: 'connected modules' },
              { value: '1', label: 'AI that sees all of them' },
              { value: '∞', label: 'modules Jarvis can build you' },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-brand-400">{s.value}</span>
                <span className="text-[11.5px] text-white/45">{s.label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* The nine, named. "9 connected modules" on its own is a number a
            visitor has to take on faith; the list is the evidence, and it is
            small enough to sit above the fold without pushing the screenshot
            off it. */}
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1.5 sm:mt-6 sm:gap-x-2.5"
        >
          {SHIPPED_MODULES.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55"
            >
              <m.icon size={11} className="shrink-0 text-brand-400/80" aria-hidden />
              {m.label}
            </li>
          ))}
        </motion.ul>

        {/* The product, inside the first screen. Tilted back a few degrees so
            it reads as an object standing in the page rather than a flat
            banner, and deliberately given no bottom padding and no bottom
            corner radius: the fold slices it, which is what makes it an
            invitation to scroll instead of a finished picture. */}
        <div className="relative mt-8 w-full max-w-5xl sm:mt-12" style={{ perspective: 1600 }}>
          {/* Ambient glow, the same trick the rest of the page uses to stop a
              panel reading as a card pasted onto flat black. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-16 -top-16 bottom-0 -z-10 rounded-[4rem] blur-3xl"
            style={{
              background: 'radial-gradient(55% 60% at 50% 30%, rgba(16,185,129,0.22), transparent 70%)',
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.7, ease: 'easeOut' }}
            className="liquid-glass-highlight overflow-hidden rounded-t-[1.75rem] p-2 shadow-[0_-10px_120px_-20px_rgba(16,185,129,0.3),0_40px_90px_-20px_rgba(0,0,0,0.8)] sm:p-3"
            style={{ transform: 'rotateX(7deg)', transformOrigin: 'top center' }}
          >
            {/* The one image that is actually on screen at first paint, so it
                is told to go first rather than queue behind the field's. */}
            <img
              src="/screens/field/dashboard.jpg"
              alt="The Ascend dashboard: discipline score, streak, today’s tasks and habits on one screen."
              width={1280}
              height={720}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="block w-full rounded-t-[1.15rem]"
            />
          </motion.div>
        </div>
      </div>

      {/* Threshold into the screen field. Without it the hero's crisp
          dashboard runs straight into the field's halftone dots and the
          handover reads as a rendering artifact rather than a new section.
          Deliberately lighter than the section headers further down — an
          eyebrow and one line, no body copy — because the spiral is the
          showcase and every pixel spent here pushes its start down the page.
          The border-t doubles as the ledge the hero screenshot sits on. */}
      <div className="relative border-t border-white/8 px-6 pb-10 pt-14 text-center sm:pb-14 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-brand-400">Every screen</p>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight sm:text-3xl">
            Scroll through the app, screen by screen
          </h2>
        </motion.div>
      </div>

      {/* The screens as a scroll-driven 3D field: cards riding a helix in
          depth, the focused one crisp while the rest dissolve into halftone
          dots, with the name index down the left edge. */}
      <ScreenField screens={FIELD_SCREENS} />

      {/* Benefits — why it helps, not just what it does */}
      <div className="relative border-t border-white/8 bg-white/[0.015] px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-brand-400">Why it works</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">
              Built to change how you actually show up
            </h2>
          </motion.div>
          {/* The featured card sits alone on its own row, then the other two
              share a row below — a 2+1 split across one row leaves the
              third card orphaned with empty space beside it at sm widths. */}
          <div className="mt-12 space-y-5">
            <motion.div
              key={BENEFITS[0].title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              className="liquid-glass-highlight flex flex-col justify-between rounded-2xl p-6 text-left sm:flex-row sm:items-start sm:gap-8 sm:p-8"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300">
                {(() => {
                  const Icon = BENEFITS[0].icon;
                  return <Icon size={18} />;
                })()}
              </span>
              <div className="mt-4 sm:mt-0">
                <p className="text-[19px] font-bold text-white">{BENEFITS[0].title}</p>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/50">{BENEFITS[0].desc}</p>
              </div>
            </motion.div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {BENEFITS.slice(1).map((b, i) => (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ delay: (i + 1) * 0.08 }}
                  className="liquid-glass-panel flex flex-col justify-between rounded-2xl p-6 text-left"
                >
                  <div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/60">
                      <b.icon size={18} />
                    </span>
                    <p className="mt-4 text-[16px] font-bold text-white">{b.title}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-white/50">{b.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Feature grid — full width, covers the real breadth: habits, Jarvis,
          module building, Arena, real integrations, journal, sync, privacy. */}
      <div className="relative px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-brand-400">Everything included</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">One app, not six subscriptions</h2>
          </motion.div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ delay: (i % 3) * 0.06 }}
                whileHover={{ y: -4 }}
                className="liquid-glass-panel flex flex-col items-start gap-2.5 rounded-2xl p-6 text-left transition-shadow hover:shadow-[0_20px_50px_-12px_rgba(16,185,129,0.25)]"
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
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative mx-auto flex w-fit items-center justify-center"
        >
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
