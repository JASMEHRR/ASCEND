/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Lightbulb,
  Eye,
  Activity,
  Sliders,
  ShoppingCart,
  LogOut,
  Loader2,
} from 'lucide-react';
import type { OSState } from './types';
import { useAuth } from './context/AuthContext';
import { useDialog } from './context/DialogContext';
import { useCloudSync } from './hooks/useCloudSync';
import { useStreak } from './hooks/useStreak';
import { disciplineScore } from './lib/discipline';
import JarvisDashboard from './features/jarvis/ui/JarvisDashboard';
import AtmosphereBackdrop, { getAutoAtmosphereId, ATMOSPHERES } from './components/AtmosphereBackdrop';
import AtmosphereSelector from './components/AtmosphereSelector';
import CondensationEffect from './components/CondensationEffect';
import FlipClock from './components/FlipClock';
import SettingsModal from './components/SettingsModal';
import RewardModal from './components/RewardModal';
import LoginScreen from './components/auth/LoginScreen';
import Jarvis from './features/jarvis/Jarvis';
import ObsidianRegistrar from './features/obsidian/ObsidianRegistrar';

// Route views that aren't the default are code-split to keep the initial bundle small.
const LaunchHub = lazy(() => import('./features/launch/LaunchHub'));
const VisionBoard = lazy(() => import('./components/VisionBoard'));
const ToBuyList = lazy(() => import('./components/ToBuyList'));
const PhysioAI = lazy(() => import('./components/PhysioAI'));

type View = 'dashboard' | 'business' | 'vision' | 'buy_list' | 'physio';

const REWARDS_LIST = [
  'Take a 5-minute break outside.',
  'Listen to your favorite song guilt-free.',
  'You earned a small piece of chocolate or a treat.',
  'Stretch your legs and grab a cold glass of water.',
  'Watch one fun short video.',
  "Give yourself a pat on the back. You're crushing it!",
];

const NAV_ITEMS: { key: View; label: string; icon: ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { key: 'physio', label: 'AI Physio', icon: <Activity size={14} /> },
  { key: 'business', label: 'Strategic Command', icon: <Lightbulb size={14} /> },
  { key: 'vision', label: 'Vision Board', icon: <Eye size={14} /> },
  { key: 'buy_list', label: 'Purchases', icon: <ShoppingCart size={14} /> },
];


function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#02040a] text-white">
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

  const [view, setView] = useState<View>('dashboard');
  const [selectedAtmosphereMode, setSelectedAtmosphereMode] = useState('auto');
  const [, setTimeTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [currentReward, setCurrentReward] = useState('');
  const [lastPointMilestone, setLastPointMilestone] = useState(0);

  // Re-render every minute so the auto atmosphere tracks the time of day.
  useEffect(() => {
    const timer = setInterval(() => setTimeTick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeAtmosphereId = selectedAtmosphereMode === 'auto' ? getAutoAtmosphereId() : selectedAtmosphereMode;
  const activeAtmosphere = ATMOSPHERES.find((a) => a.id === activeAtmosphereId) || ATMOSPHERES[1];

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

  // --- Auth / load gates (all hooks above run unconditionally) ---
  if (initializing) return <FullScreenLoader label="Connecting…" />;
  if (!user) return <LoginScreen />;
  if (!state) return <FullScreenLoader label="Loading your protocol…" />;

  const currentScore = disciplineScore(state);
  const openTasks = state.tasks.filter((t) => !t.done).length;

  return (
    <div className="relative flex flex-col h-screen w-full bg-[#02040a] text-[#f4f4f5] font-plus p-4 md:p-6 pb-20 sm:pb-6 gap-5 overflow-hidden selection:bg-brand-500/30 selection:text-white">
      <AtmosphereBackdrop currentAtmosphere={activeAtmosphere} />
      <CondensationEffect active={activeAtmosphere.condensationActive} />

      {/* HEADER */}
      <header className="relative flex flex-col md:flex-row justify-between items-center pb-2 px-2 z-10 gap-5 shrink-0 w-full mb-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] whitespace-nowrap">
          Ascend Protocol
        </h1>

        <div className="flex gap-3 items-center w-full md:w-auto justify-end">
          <div className="relative overflow-hidden bg-brand-500/10 border border-brand-500/30 px-5 py-2.5 rounded-[1.75rem] shadow-[0_4px_24px_rgba(16,185,129,0.15)] flex flex-col items-center justify-center backdrop-blur-3xl">
            <span className="text-[8.5px] font-mono font-black uppercase text-brand-400 tracking-[0.2em] leading-none mb-1">Global XP</span>
            <span className="text-xl font-bold text-white leading-none flex items-baseline gap-1">
              {state.points || 0}
              <span className="text-brand-400/50 text-[11px] font-mono">pts</span>
            </span>
          </div>

          <div className="relative overflow-hidden bg-white/[0.04] border border-white/12 px-5 py-2.5 rounded-[1.75rem] shadow-[0_8px_32px_rgba(0,0,0,0.37)] flex items-center gap-3.5 backdrop-blur-3xl">
            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" aria-hidden="true">
                <circle className="text-white/[0.06]" strokeWidth="2.5" stroke="currentColor" fill="transparent" r="15" cx="18" cy="18" />
                <circle
                  className="text-white transition-all duration-1000 ease-out"
                  strokeWidth="2.5"
                  strokeDasharray={2 * Math.PI * 15}
                  strokeDashoffset={2 * Math.PI * 15 * (1 - currentScore / 100)}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="15"
                  cx="18"
                  cy="18"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.45))' }}
                />
              </svg>
              <span className="absolute text-[9.5px] font-mono font-black text-white/50 tracking-tighter">%</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[8.5px] font-mono font-black uppercase text-white/40 tracking-[0.2em] leading-none">Discipline Ratio</span>
              <span className="text-xl font-bold text-white leading-none mt-1.5 flex items-baseline gap-1">
                {currentScore}
                <span className="text-white/40 text-[11px] font-normal font-mono">/100</span>
              </span>
            </div>
          </div>

          <HeaderAccount />
        </div>
      </header>

      {/* CORE */}
      <div className="relative flex flex-1 flex-col sm:flex-row gap-5 min-h-0 z-10">
        {/* SIDEBAR */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col gap-4">
          <div className="liquid-glass-panel rounded-[2rem] p-4 flex flex-col gap-5 h-full overflow-y-auto custom-scrollbar">
            <div className="flex flex-col items-center justify-center -mx-2">
              <FlipClock compact />
            </div>

            <div className="space-y-2 border-t border-white/5 pt-3">
              <p className="text-[9px] font-extrabold text-white/40 uppercase tracking-[0.18em] pl-1.5 leading-none font-mono">Sanctuary Atmosphere</p>
              <AtmosphereSelector value={selectedAtmosphereMode} onChange={setSelectedAtmosphereMode} />
            </div>

            <nav className="space-y-1.5 pt-1 border-t border-white/5" aria-label="Primary">
              <p className="text-[9px] font-extrabold text-white/40 uppercase tracking-[0.18em] mb-2.5 pl-1.5 leading-none font-mono">Navigation</p>
              <div className="grid grid-cols-1 gap-1.5">
                {NAV_ITEMS.map((tab) => {
                  const badge = tab.key === 'business' ? state.ideas.length : tab.key === 'buy_list' ? openTasks : 0;
                  const active = view === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setView(tab.key)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full relative flex items-center justify-between px-4.5 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                        active
                          ? 'bg-white/15 text-white border-white/20 shadow-sm backdrop-blur-md font-extrabold'
                          : 'text-white/40 border-transparent bg-white/[0.01] hover:text-white/85 hover:bg-white/[0.07] hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span className={active ? 'text-white' : 'text-white/40'}>{tab.icon}</span>
                        {tab.label}
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
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 15, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, filter: 'blur(6px)' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="h-full"
            >
              <Suspense fallback={<ViewFallback />}>
                {view === 'dashboard' && <JarvisDashboard state={state} updateState={updateState} setView={setView} />}
                {view === 'business' && <LaunchHub state={state} updateState={updateState} />}
                {view === 'physio' && <PhysioAI state={state} updateState={updateState} />}
                {view === 'vision' && <VisionBoard state={state} updateState={updateState} />}
                {view === 'buy_list' && <ToBuyList state={state} updateState={updateState} />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav
        className="sm:hidden fixed bottom-3 left-4 right-4 bg-[#02040a]/85 backdrop-blur-md border border-white/12 py-3 px-5 flex justify-between items-center z-50 rounded-[2.5rem] shadow-lg overflow-x-auto"
        aria-label="Primary"
      >
        {(['dashboard', 'business', 'physio'] as View[]).map((key) => (
          <MobileNavButton key={key} view={key} current={view} onSelect={setView} badge={key === 'business' ? state.ideas.length : 0} />
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="w-14 h-14 shrink-0 mx-2 rounded-full flex items-center justify-center border transition-all glass-shimmer cursor-pointer -translate-y-5 shadow-lg bg-white/[0.08] hover:bg-white/[0.15] text-white border-white/20 pb-0.5"
        >
          <Sliders size={22} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
        </button>
        {(['vision', 'buy_list'] as View[]).map((key) => (
          <MobileNavButton key={key} view={key} current={view} onSelect={setView} badge={key === 'buy_list' ? openTasks : 0} />
        ))}
      </nav>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        updateState={updateState}
        selectedAtmosphereMode={selectedAtmosphereMode}
        setSelectedAtmosphereMode={setSelectedAtmosphereMode}
      />

      <RewardModal isOpen={rewardModalOpen} onClose={() => setRewardModalOpen(false)} rewardContent={currentReward} />

      <Jarvis state={state} updateState={updateState} view={view} setView={setView} />
      <ObsidianRegistrar />
    </div>
  );
}

const MOBILE_ICONS: Record<View, ReactNode> = {
  dashboard: <LayoutDashboard size={20} />,
  business: <Lightbulb size={20} />,
  physio: <Activity size={20} />,
  vision: <Eye size={20} />,
  buy_list: <ShoppingCart size={20} />,
};

function MobileNavButton({
  view,
  current,
  onSelect,
  badge,
}: {
  view: View;
  current: View;
  onSelect: (v: View) => void;
  badge: number;
}) {
  const label = NAV_ITEMS.find((n) => n.key === view)?.label ?? view;
  return (
    <button
      onClick={() => onSelect(view)}
      aria-label={label}
      aria-current={current === view ? 'page' : undefined}
      className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${
        current === view ? 'text-white bg-white/10' : 'text-white/40'
      }`}
    >
      {MOBILE_ICONS[view]}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-brand-500 text-white min-w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold px-1 ring-2 ring-[#02040a]">
          {badge}
        </span>
      )}
    </button>
  );
}
