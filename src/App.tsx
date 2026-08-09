/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sliders, LogOut, Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { readStore, writeStore } from './lib/storage';
import { useAuth } from './context/AuthContext';
import { useDialog } from './context/DialogContext';
import { useCloudSync } from './hooks/useCloudSync';
import { useStreak } from './hooks/useStreak';
import { useFeatures } from './features/useFeatures';
import { isFeatureEnabled, type FeatureId, type FeatureModule } from './features/registry';
import { disciplineScore } from './lib/discipline';
import JarvisDashboard from './features/jarvis/ui/JarvisDashboard';
import AtmosphereBackdrop, { getAutoAtmosphereId, atmosphereFromCustom, ATMOSPHERES } from './components/AtmosphereBackdrop';
import CondensationEffect from './components/CondensationEffect';
import FlipClock from './components/FlipClock';
import SettingsModal from './components/SettingsModal';
import RewardModal from './components/RewardModal';
import LoginScreen from './components/auth/LoginScreen';
import LandingPage from './components/LandingPage';
import SetupWizard from './components/SetupWizard';
import Jarvis from './features/jarvis/Jarvis';
import ObsidianRegistrar from './features/obsidian/ObsidianRegistrar';
import RemindersRegistrar from './features/reminders/RemindersRegistrar';
import PlanningRegistrar from './features/planning/PlanningRegistrar';
import GmailRegistrar from './features/gmail/GmailRegistrar';
import StocksRegistrar from './features/stocks/StocksRegistrar';
import WebSearchRegistrar from './features/websearch/WebSearchRegistrar';
import KiteRegistrar from './features/kite/KiteRegistrar';
import JournalRegistrar from './features/journal/JournalRegistrar';
import InsightsEngine from './features/insights/InsightsEngine';
import ArenaRegistrar from './features/arena/ArenaRegistrar';
import CustomModulesRegistrar from './features/custom/CustomModulesRegistrar';

// Route views that aren't the default are code-split to keep the initial bundle small.
const LaunchHub = lazy(() => import('./features/launch/LaunchHub'));
const VisionBoard = lazy(() => import('./components/VisionBoard'));
const ToBuyList = lazy(() => import('./components/ToBuyList'));
const PhysioAI = lazy(() => import('./components/PhysioAI'));
const StocksHub = lazy(() => import('./features/stocks/StocksHub'));
const JournalHub = lazy(() => import('./features/journal/JournalHub'));
const ArenaHub = lazy(() => import('./features/arena/ArenaHub'));
const CustomModulesHub = lazy(() => import('./features/custom/CustomModulesHub'));

type View = 'dashboard' | 'business' | 'vision' | 'buy_list' | 'physio' | 'stocks' | 'journal' | 'arena' | 'custom';

const REWARDS_LIST = [
  'Take a 5-minute break outside.',
  'Listen to your favorite song guilt-free.',
  'You earned a small piece of chocolate or a treat.',
  'Stretch your legs and grab a cold glass of water.',
  'Watch one fun short video.',
  "Give yourself a pat on the back. You're crushing it!",
];

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-app text-white">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-9 w-9 animate-spin text-brand-500" />
        <p className="text-white/50 text-sm font-mono uppercase tracking-widest">{label}</p>
      </div>
    </div>
  );
}

function ViewFallback() {
  return (
    <div className="flex h-full min-h-[240px] w-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-white/30" />
    </div>
  );
}

function HeaderAccount() {
  const { user, logout } = useAuth();
  const { confirm } = useDialog();
  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  const handleSignOut = async () => {
    if (await confirm({ title: 'Sign out?', message: 'You can sign back in anytime.', confirmLabel: 'Sign out', danger: true })) {
      await logout();
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-[1.75rem] border border-white/12 bg-white/[0.04] px-2 py-1.5 backdrop-blur-3xl">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-sm font-bold text-brand-300"
        title={user?.email ?? undefined}
        aria-hidden="true"
      >
        {initial}
      </div>
      <span className="hidden max-w-[9rem] truncate text-[11px] font-medium text-white/60 lg:block">
        {user?.email}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        aria-label="Sign out"
        className="rounded-full p-2 text-white/45 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}

export default function App() {
  const { user, initializing } = useAuth();
  const { state, updateState } = useCloudSync(user?.uid ?? null);
  const features = useFeatures(state, updateState);

  const [view, setView] = useState<View>('dashboard');
  const [, setTimeTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Collapsing the nav hands the width to whichever module is open — the
  // puzzle and the stocks table both want it. Remembered across reloads.
  const [navOpen, setNavOpen] = useState(() => readStore('ascend_nav') !== 'closed');
  const toggleNav = () =>
    setNavOpen((open) => {
      writeStore('ascend_nav', open ? 'closed' : 'open');
      return !open;
    });
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [currentReward, setCurrentReward] = useState('');
  const [lastPointMilestone, setLastPointMilestone] = useState(0);
  // A signed-out visitor sees the landing page first, then the sign-in card —
  // once they've clicked through, skip straight to sign-in on future visits
  // instead of showing the pitch every single time.
  const [pastLanding, setPastLanding] = useState(() => readStore('ascend_seen_landing') === '1');
  // Lets Settings re-open the wizard without clearing the saved setupComplete
  // flag, so abandoning a re-run leaves the original choices intact.
  const [setupOpen, setSetupOpen] = useState(false);

  // Re-render every minute so the auto atmosphere tracks the time of day.
  useEffect(() => {
    const timer = setInterval(() => setTimeTick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Drive the global glass look from the user's Appearance preferences.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--glass-opacity', String(state?.glassOpacity ?? 1));
    root.setProperty('--glass-blur', `${state?.glassBlur ?? 20}px`);
  }, [state?.glassOpacity, state?.glassBlur]);

  // Persisted (not local state) so the choice survives a reload — it never
  // did before, silently resetting to auto every time the app was reopened.
  const selectedAtmosphereMode = state?.atmosphereMode ?? 'auto';
  const setSelectedAtmosphereMode = (mode: string) => updateState((s) => ({ ...s, atmosphereMode: mode }));
  const customBackground = state?.customBackgrounds?.find((b) => b.id === selectedAtmosphereMode);
  const activeAtmosphereId = selectedAtmosphereMode === 'auto' ? getAutoAtmosphereId() : selectedAtmosphereMode;
  const activeAtmosphere =
    (customBackground && atmosphereFromCustom(customBackground)) ||
    ATMOSPHERES.find((a) => a.id === activeAtmosphereId) ||
    ATMOSPHERES[1];

  // Reward the user on every 10-point milestone.
  useEffect(() => {
    if (!state) return;
    const pts = state.points || 0;
    if (pts > 0 && pts % 10 === 0 && pts > lastPointMilestone) {
      setLastPointMilestone(pts);
      setCurrentReward(REWARDS_LIST[Math.floor(Math.random() * REWARDS_LIST.length)]);
      setRewardModalOpen(true);
    }
  }, [state?.points, lastPointMilestone]);

  // Maintain the daily activity streak once there's any progress today.
  useStreak(state, updateState, !!state && disciplineScore(state) > 0);

  // If the active view's module gets disabled, fall back to the Jarvis home.
  useEffect(() => {
    if (view !== 'dashboard' && !isFeatureEnabled(state, view as FeatureId)) {
      setView('dashboard');
    }
  }, [state, view]);

  // --- Auth / load gates (all hooks above run unconditionally) ---
  if (initializing) return <FullScreenLoader label="Connecting…" />;
  // Dev-only: the landing page normally renders for signed-out visitors only,
  // so `?landing=1` is the way to look at it while signed in. Gated on DEV so
  // the flag is stripped from production builds rather than shipping a public
  // switch that puts the marketing page over a signed-in user's app.
  const forceLanding =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('landing');
  if (forceLanding || (!user && !pastLanding)) {
    return (
      <LandingPage
        onContinue={() => {
          writeStore('ascend_seen_landing', '1');
          setPastLanding(true);
        }}
      />
    );
  }
  if (!user) return <LoginScreen />;
  if (!state) return <FullScreenLoader label="Loading your protocol…" />;

  const openTasks = state.tasks.filter((t) => !t.done).length;
  const mobileModules = features.navModules.filter((m) => m.mobile);
  const mobileMid = Math.ceil(mobileModules.length / 2);
  const showSetup = setupOpen || !state.setupComplete;

  // Shell sizing note: h-dvh rather than h-screen, because 100vh on mobile
  // excludes the browser address bar — combined with overflow-hidden that put
  // the bottom of the app off-screen with no way to reach it. The bottom
  // padding clears the fixed mobile nav, which now hides at the same
  // breakpoint the sidebar appears (md) instead of at sm, closing a gap where
  // neither was visible.
  return (
    <div className="relative flex flex-col h-dvh w-full bg-app text-white/95 font-plus p-3 sm:p-4 md:p-6 pb-24 md:pb-6 gap-3 sm:gap-5 overflow-hidden selection:bg-brand-500/30 selection:text-white">
      <AtmosphereBackdrop currentAtmosphere={activeAtmosphere} />
      <CondensationEffect active={activeAtmosphere.condensationActive} />
      {/* Light mode lays a soft veil over the photographic atmosphere for contrast. */}
      <div aria-hidden="true" className="theme-veil pointer-events-none absolute inset-0" />

      {/* HEADER */}
      {/* On a phone the title and account chip share one row — stacking them
          burned vertical space the dashboard needs more than the header does. */}
      <header className="relative flex flex-row justify-between items-center pb-1 sm:pb-2 px-1 sm:px-2 z-10 gap-3 sm:gap-5 shrink-0 w-full mb-0 sm:mb-2">
        <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] whitespace-nowrap">
          Ascend Protocol
        </h1>

        {/* Header stays minimal — vitals live in the dashboard's Vitals panel. */}
        <div className="flex gap-3 items-center justify-end min-w-0">
          <HeaderAccount />
        </div>
      </header>

      {/* CORE */}
      <div className="relative flex flex-1 flex-col md:flex-row gap-3 sm:gap-5 min-h-0 z-10">
        {/* SIDEBAR */}
        {/* Collapsed nav: an icon strip that keeps every module one click away. */}
        {!navOpen && (
          <aside className="hidden md:flex shrink-0">
            <div className="liquid-glass-panel flex h-full flex-col items-center gap-1.5 rounded-[2rem] p-2">
              <button
                onClick={toggleNav}
                aria-label="Expand navigation"
                title="Expand navigation"
                className="rounded-xl p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <PanelLeftOpen size={16} />
              </button>
              <span className="my-0.5 h-px w-6 bg-white/10" />
              {features.navModules.map((mod) => {
                const Icon = mod.icon;
                const active = view === mod.id;
                return (
                  <button
                    key={mod.id}
                    onClick={() => setView(mod.id as View)}
                    aria-label={mod.label}
                    title={mod.label}
                    className={`rounded-xl p-2.5 transition-all cursor-pointer ${
                      active ? 'bg-white/15 text-white' : 'text-white/40 hover:bg-white/[0.07] hover:text-white/85'
                    }`}
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                title="Settings"
                className="mt-auto rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <Sliders size={15} />
              </button>
            </div>
          </aside>
        )}

        <aside className={navOpen ? 'hidden md:flex w-64 shrink-0 flex-col gap-4' : 'hidden'}>
          <div className="liquid-glass-panel rounded-[2rem] p-4 flex flex-col gap-5 h-full overflow-y-auto custom-scrollbar">
            <div className="flex flex-col items-center justify-center -mx-2">
              <FlipClock compact />
            </div>

            {/* Sanctuary Atmosphere moved to Settings — pick a background and
                manage custom ones from there instead of a sidebar dropdown. */}
            <nav className="space-y-1.5 border-t border-white/5 pt-3" aria-label="Primary">
              <div className="mb-2.5 flex items-center justify-between gap-2 pl-1.5">
                <p className="text-[9px] font-extrabold text-white/40 uppercase tracking-[0.18em] leading-none font-mono">Navigation</p>
                <button
                  onClick={toggleNav}
                  aria-label="Collapse navigation"
                  title="Collapse navigation"
                  className="rounded-lg p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  <PanelLeftClose size={13} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {features.navModules.map((mod) => {
                  const badge = badgeFor(mod.id, state.ideas.length, openTasks);
                  const active = view === mod.id;
                  const Icon = mod.icon;
                  return (
                    <button
                      key={mod.id}
                      onClick={() => setView(mod.id as View)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full relative flex items-center justify-between gap-2 px-4 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-wider transition-all border cursor-pointer text-left ${
                        active
                          ? 'bg-white/15 text-white border-white/20 shadow-sm backdrop-blur-md font-extrabold'
                          : 'text-white/40 border-transparent bg-white/[0.01] hover:text-white/85 hover:bg-white/[0.07] hover:border-white/10'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span className={`shrink-0 ${active ? 'text-white' : 'text-white/40'}`}><Icon size={14} /></span>
                        <span className="min-w-0 truncate">{mod.label}</span>
                      </div>
                      {badge > 0 && (
                        <span className="bg-brand-500/20 text-brand-400 min-w-5 h-5 flex items-center justify-center rounded-full text-[9px] px-1.5 ml-2 font-mono ring-1 ring-brand-500/50">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="pt-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/85 hover:text-white rounded-2xl transition-all cursor-pointer shadow-sm text-[11px] font-bold uppercase tracking-wider"
              >
                <div className="flex items-center gap-3">
                  <Sliders size={14} className="text-white/50" />
                  <span>Settings</span>
                </div>
                <svg className="w-3.5 h-3.5 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className="mt-auto pt-4 border-t border-white/5 text-[8px] font-mono font-bold text-white/25 uppercase tracking-[0.16em] text-center">
              Ascend Protocol
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col gap-6 min-w-0 overflow-y-auto custom-scrollbar">
          {/* Enter-only fade: an exit/enter handoff (mode="wait") could drop the
              enter animation and leave the new view stuck invisible at opacity 0. */}
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="h-full"
          >
              <Suspense fallback={<ViewFallback />}>
                {view === 'dashboard' && <JarvisDashboard state={state} updateState={updateState} setView={setView} openSettings={() => setSettingsOpen(true)} />}
                {view === 'business' && <LaunchHub state={state} updateState={updateState} />}
                {view === 'physio' && <PhysioAI state={state} updateState={updateState} />}
                {view === 'vision' && <VisionBoard state={state} updateState={updateState} />}
                {view === 'buy_list' && <ToBuyList state={state} updateState={updateState} />}
                {view === 'stocks' && <StocksHub state={state} updateState={updateState} />}
                {view === 'journal' && <JournalHub state={state} updateState={updateState} />}
                {view === 'arena' && <ArenaHub state={state} updateState={updateState} />}
                {view === 'custom' && <CustomModulesHub />}
              </Suspense>
          </motion.div>
        </main>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav
        className="md:hidden fixed bottom-3 left-3 right-3 bg-app/85 backdrop-blur-md border border-white/12 py-2.5 px-3 sm:px-5 flex justify-between items-center z-50 rounded-[2.5rem] shadow-lg overflow-x-auto"
        aria-label="Primary"
      >
        {mobileModules.slice(0, mobileMid).map((mod) => (
          <MobileNavButton key={mod.id} module={mod} current={view} onSelect={setView} badge={badgeFor(mod.id, state.ideas.length, openTasks)} />
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="w-14 h-14 shrink-0 mx-2 rounded-full flex items-center justify-center border transition-all glass-shimmer cursor-pointer -translate-y-5 shadow-lg bg-white/[0.08] hover:bg-white/[0.15] text-white border-white/20 pb-0.5"
        >
          <Sliders size={22} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
        </button>
        {mobileModules.slice(mobileMid).map((mod) => (
          <MobileNavButton key={mod.id} module={mod} current={view} onSelect={setView} badge={badgeFor(mod.id, state.ideas.length, openTasks)} />
        ))}
      </nav>

      {/* First run, or a deliberate re-run from Settings. Rendered above
          everything so the choices are made before the app is used. */}
      {showSetup && (
        <SetupWizard
          state={state}
          updateState={updateState}
          fallbackName={(user.email ?? 'there').split('@')[0]}
          onDone={() => setSetupOpen(false)}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        updateState={updateState}
        features={features}
        selectedAtmosphereMode={selectedAtmosphereMode}
        setSelectedAtmosphereMode={setSelectedAtmosphereMode}
        onRerunSetup={() => {
          setSettingsOpen(false);
          setSetupOpen(true);
        }}
      />

      <RewardModal isOpen={rewardModalOpen} onClose={() => setRewardModalOpen(false)} rewardContent={currentReward} />

      <Jarvis state={state} updateState={updateState} view={view} setView={setView} />
      <ObsidianRegistrar />
      <RemindersRegistrar />
      <WebSearchRegistrar />
      {isFeatureEnabled(state, 'planning') && <PlanningRegistrar />}
      {isFeatureEnabled(state, 'gmail') && <GmailRegistrar />}
      {isFeatureEnabled(state, 'stocks') && <StocksRegistrar state={state} updateState={updateState} />}
      {isFeatureEnabled(state, 'stocks') && <KiteRegistrar />}
      {isFeatureEnabled(state, 'journal') && <JournalRegistrar state={state} updateState={updateState} />}
      {isFeatureEnabled(state, 'insights') && <InsightsEngine state={state} />}
      {isFeatureEnabled(state, 'arena') && <ArenaRegistrar />}
      {isFeatureEnabled(state, 'custom') && <CustomModulesRegistrar />}
    </div>
  );
}

/** Badge counts shown on nav modules that surface a pending count. */
function badgeFor(id: FeatureId, ideaCount: number, openTasks: number): number {
  if (id === 'business') return ideaCount;
  if (id === 'buy_list') return openTasks;
  return 0;
}

function MobileNavButton({
  module,
  current,
  onSelect,
  badge,
}: {
  module: FeatureModule;
  current: View;
  onSelect: (v: View) => void;
  badge: number;
}) {
  const Icon = module.icon;
  const active = current === module.id;
  return (
    <button
      onClick={() => onSelect(module.id as View)}
      aria-label={module.label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${
        active ? 'text-white bg-white/10' : 'text-white/40'
      }`}
    >
      <Icon size={20} />
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-brand-500 text-white min-w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold px-1 ring-2 ring-app">
          {badge}
        </span>
      )}
    </button>
  );
}
