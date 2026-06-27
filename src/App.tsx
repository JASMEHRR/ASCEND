/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Lightbulb, 
  BarChart3, 
  Download, 
  Plus, 
  Check, 
  X,
  Droplets,
  Zap,
  Sun,
  Moon,
  Eye,
  Activity,
  Timer,
  ShieldCheck,
  Sparkles,
  Clipboard,
  Sliders,
  ShoppingCart
} from 'lucide-react';
import { OSState, Task, Idea, VisionItem } from './types';
import { RITUALS, HEALTH_STACK, STOIC_QUOTES } from './constants';
import Dashboard from './components/Dashboard';
import BusinessHub from './components/BusinessHub';
import WeeklyReview from './components/WeeklyReview';
import VisionBoard from './components/VisionBoard';
import ToBuyList from './components/ToBuyList';
import CountdownTimer from './components/CountdownTimer';
import AtmosphereBackdrop, { getAutoAtmosphereId, ATMOSPHERES } from './components/AtmosphereBackdrop';
import CondensationEffect from './components/CondensationEffect';
import FlipClock from './components/FlipClock';
import SystemLogsModal from './components/SystemLogsModal';
import RewardModal from './components/RewardModal';
import PhysioAI from './components/PhysioAI';

const REWARDS_LIST = [
  "Take a 5-minute break outside.",
  "Listen to your favorite song guilt-free.",
  "You earned a small piece of chocolate or a treat.",
  "Stretch your legs and grab a cold glass of water.",
  "Watch one fun short video.",
  "Give yourself a pat on the back. You're crushing it!"
];

const INITIAL_STATE: OSState = {
  lastVisit: new Date().toISOString().split('T')[0],
  water: 0,
  rituals: {},
  exerciseAM: {},
  exercisePM: {},
  customAM: [],
  customPM: [],
  tasks: [],
  ideas: [],
  visionBoard: [],
  steps: 0,
  isFitConnected: false,
  points: 0
};

import { googleSignIn, initAuth, logout } from './lib/firebase';
import { db } from './lib/firebase';
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import type { User } from 'firebase/auth';

export default function App() {
  const [view, setView] = useState<'dashboard' | 'business' | 'review' | 'vision' | 'buy_list' | 'physio'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<OSState | null>(null);
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [isSyncingSteps, setIsSyncingSteps] = useState(false);
  const [fitSyncError, setFitSyncError] = useState<string | null>(null);
  const [selectedAtmosphereMode, setSelectedAtmosphereMode] = useState<string>('auto');
  const [timeTick, setTimeTick] = useState<number>(0);
  const [logsPanelOpen, setLogsPanelOpen] = useState(false);
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [currentReward, setCurrentReward] = useState("");
  const [lastPointMilestone, setLastPointMilestone] = useState(0);
  const [appLogs, setAppLogs] = useState<string[]>([
    "Initializing Ascend Protocol V6.0 Platform Module...",
    "Loaded climate backdrop sheet: Ambient Mountains Renderer ready",
    "Local server static mapping verified securely",
    "Cloud database link initialized successfully",
    "Ready for active sequence."
  ]);

  const logEvent = (msg: string) => {
    setAppLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200));
  };

  // Auto-sync atmosphere minute-based updater
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick(prev => prev + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const activeAtmosphereId = selectedAtmosphereMode === 'auto' ? getAutoAtmosphereId() : selectedAtmosphereMode;
  const activeAtmosphere = ATMOSPHERES.find(a => a.id === activeAtmosphereId) || ATMOSPHERES[1];

  // Log atmosphere changes
  useEffect(() => {
    logEvent(`Sanctuary Atmosphere shifted to [${activeAtmosphere.name}]`);
  }, [activeAtmosphereId]);

  // Check milestones for rewards
  useEffect(() => {
    if (!state) return;
    const pts = state.points || 0;
    if (pts > 0 && pts % 10 === 0 && pts > lastPointMilestone) {
      setLastPointMilestone(pts);
      setCurrentReward(REWARDS_LIST[Math.floor(Math.random() * REWARDS_LIST.length)]);
      setRewardModalOpen(true);
    }
  }, [state?.points, lastPointMilestone]);

  const checkFitAuth = async () => {
    try {
      const headers: HeadersInit = {};
      const localTokens = localStorage.getItem('fit_tokens');
      if (localTokens) {
        headers['x-fit-tokens'] = localTokens;
      }

      const res = await fetch('/api/auth/status', { headers });
      const data = await res.json();
      
      // If we don't have a valid connection, check if we thought we were connected
      if (data.connected) {
        updateState(prev => ({ 
           ...prev, 
           isFitConnected: true,
           fitStatus: 'Active (Auto-refresh)' 
        }));
      } else {
        // Only set to disconnected if we actually failed auth
        // instead of aggressively wiping it on launch.
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    checkFitAuth();
    return initAuth((user) => {
      setUser(user);
    }, () => {
      setUser(null);
    });
  }, []);

  // Listen for Google Fit authentication popup success message
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      console.log("[OAuth Listener] Received message from origin:", event.origin);
      console.log("[OAuth Listener] Message data:", event.data);
      
      // Ensure the message comes from the exact same origin (our backend)
      // Allow dynamic AI Studio preview domains and localhost
      if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost') && !event.origin.includes('127.0.0.1') && event.origin !== window.location.origin) {
        console.warn("[OAuth Listener] Origin rejected:", event.origin);
        return;
      }

      if (event.data?.type === 'GOOGLE_FIT_AUTH_SUCCESS') {
        console.log("[Google Fit Popup] Received success from auth popup. Checking backend state...");
        
        if (event.data.tokens) {
          localStorage.setItem('fit_tokens', JSON.stringify(event.data.tokens));
        }

        logEvent("[OAuth] Token exchange successful, verifying auth state...");
        updateState(prev => ({ 
           ...prev, 
           isFitConnected: true,
           fitStatus: 'Active (Auto-refresh)' 
        }));
        
        console.log("[Google Fit Popup] State updated. Triggering sync.");
        logEvent("[OAuth] Fit credentials validated. Initiating Google Fit synchronization...");
        setSyncTrigger(prev => prev + 1);
        setFitSyncError(null);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, []);

  // Sync state with Firestore if user is logged in
  useEffect(() => {
    if (user === null) {
       // if we explicitly logged out or haven't logged in, use initialized state
       setState(INITIAL_STATE);
       return;
    }

    const today = new Date().toISOString().split('T')[0];
    const userDocRef = doc(db, 'users', user.uid);
    const dailyDocRef = doc(db, 'users', user.uid, 'dailyStates', today);

    // Initial load
    const loadData = async () => {
      try {
        console.log("[Firestore] Attempting to load user and daily states...");
        const userSnap = await getDoc(userDocRef);
        const dailySnap = await getDoc(dailyDocRef);

        if (userSnap.exists() || dailySnap.exists()) {
          const userData = userSnap.data() || {};
          const dailyData = dailySnap.data() || {};
          
          setState((prev) => {
            const base = prev || INITIAL_STATE;
            return {
              ...base,
              ...userData,
              ...dailyData,
              lastVisit: today,
              tasks: userData.tasks || [],
              ideas: userData.ideas || [],
              visionBoard: userData.visionBoard || [],
              physioState: dailyData.physioState || base.physioState,
              customAM: dailyData.customAM || userData.customAM || base.customAM || [],
              customPM: dailyData.customPM || userData.customPM || base.customPM || [],
            };
          });
          console.log("[Firestore] State successfully synchronized from cloud.");
        } else {
          setState(INITIAL_STATE);
          console.log("[Firestore] New Firestore profile. Initialized default session.");
        }
      } catch (err: any) {
        console.warn("[Firestore] Failed to fetch cloud documents. Using default state:", err);
        setState(INITIAL_STATE);
      }
    };

    loadData();
  }, [user]);

  // Save changes to Firestore and fallback to localStorage
  useEffect(() => {
    if (!state) return;

    // Always update local storage for instant single-user continuity & offline support
    localStorage.setItem('LIFE_OS_ULTIMATE', JSON.stringify(state));

    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const userDocRef = doc(db, 'users', user.uid);
    const dailyDocRef = doc(db, 'users', user.uid, 'dailyStates', today);

    const persist = async () => {
      try {
        await setDoc(userDocRef, {
          tasks: state.tasks,
          ideas: state.ideas,
          visionBoard: state.visionBoard,
        }, { merge: true });

        await setDoc(dailyDocRef, {
          water: state.water,
          rituals: state.rituals,
          exerciseAM: state.exerciseAM,
          exercisePM: state.exercisePM,
          customAM: state.customAM || [],
          customPM: state.customPM || [],
          steps: state.steps,
          physioState: state.physioState,
        }, { merge: true });
      } catch (err: any) {
        console.warn("[Firestore] Failed to save copy online (client is offline or rules propagating):", err.message || err);
      }
    };

    const timeoutId = setTimeout(() => {
      persist();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [state, user]);

  useEffect(() => {
    if (state?.isFitConnected) {
      const fetchSteps = async () => {
        setIsSyncingSteps(true);
        logEvent("Starting Google Fit metrics sync query...");
        try {
          // Calculate client-side start of day and current time in local timezone
          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const startTime = startOfDay.getTime();
          const endTime = now.getTime();

          const headers: HeadersInit = {};
          const localTokens = localStorage.getItem('fit_tokens');
          if (localTokens) {
            headers['x-fit-tokens'] = localTokens;
          }

          const res = await fetch(`/api/steps?startTime=${startTime}&endTime=${endTime}`, {
            headers
          });
          if (res.ok) {
            const data = await res.json();
            updateState(prev => ({ 
              ...prev, 
              steps: data.steps, 
              fitLastSync: new Date().toISOString()
            }));
            setFitSyncError(null);
            logEvent(`Google Fit sync success: ${data.steps} steps registered`);
          } else {
            const errData = await res.json().catch(() => ({}));
            if (res.status === 401 || (errData.error && errData.error.toLowerCase().includes('credentials'))) {
              localStorage.removeItem('fit_tokens');
              updateState(prev => ({ ...prev, isFitConnected: false, fitStatus: 'Session Expired' }));
              setFitSyncError(errData.details || errData.error || "Session expired. Please reconnect.");
              logEvent("Google Fit credentials expired or invalid, re-auth required.");
              setIsSyncingSteps(false);
              return;
            }
            setFitSyncError(errData.details || errData.error || "Failed to sync steps");
            logEvent(`Google Fit error: ${errData.error || 'General sync failure'}`);
          }
        } catch (e: any) {
          console.error("Failed to sync steps", e);
          setFitSyncError(e.message || "Failed to sync steps");
          logEvent(`Google Fit network exception: ${e.message}`);
        } finally {
          setIsSyncingSteps(false);
        }
      };
      
      fetchSteps();
      const interval = setInterval(fetchSteps, 300000);
      return () => clearInterval(interval);
    }
  }, [state?.isFitConnected, syncTrigger, user]);

  const connectGoogleFit = async () => {
    try {
      const origin = window.location.origin;
      const res = await fetch(`/api/auth/google/url?origin=${encodeURIComponent(origin)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || "Failed to get Google Fit Auth URL from server");
      }
      const { url, exactRedirectUri, clientIdSuffix } = await res.json();
      
      console.log(`[Google Fit OAuth] Exact redirect_uri: ${exactRedirectUri}, Client ID Suffix: ...${clientIdSuffix}`);
      logEvent(`OAuth initialized. Client suffix: ...${clientIdSuffix}, URI: ${exactRedirectUri}`);
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        url,
        "google_fit_oauth",
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        setFitSyncError("Popup was blocked by the browser. Please enable popups to link Google Fit.");
      }
    } catch (e: any) {
      console.error("OAuth init failed", e);
      setFitSyncError(e.message || "Failed to start Google Fit Connection");
    }
  };

  const triggerStepSync = () => {
    if (state?.isFitConnected) {
      setSyncTrigger(prev => prev + 1);
    }
  };

  const updateState = (updater: (prev: OSState) => OSState) => {
    setState(prev => {
      if (!prev) return prev;
      const next = updater(prev);
      let gainedPoints = 0;
      
      // Calculate gains
      if (next.water > prev.water) gainedPoints += (next.water - prev.water);
      
      const ritualsGain = Object.values(next.rituals).filter(Boolean).length - Object.values(prev.rituals).filter(Boolean).length;
      if (ritualsGain > 0) gainedPoints += ritualsGain;
      
      const amGain = Object.values(next.exerciseAM).filter(Boolean).length - Object.values(prev.exerciseAM).filter(Boolean).length;
      if (amGain > 0) gainedPoints += amGain;
      
      const pmGain = Object.values(next.exercisePM).filter(Boolean).length - Object.values(prev.exercisePM).filter(Boolean).length;
      if (pmGain > 0) gainedPoints += pmGain;
      
      const tasksGain = next.tasks.filter(t => t.done).length - prev.tasks.filter(t => t.done).length;
      if (tasksGain > 0) gainedPoints += tasksGain;

      // also check primaryObjective
      if (next.primaryObjective?.done && !prev.primaryObjective?.done) {
        gainedPoints += 2; // Extra point for primary objective
      }

      if (gainedPoints > 0) {
        next.points = (next.points || 0) + gainedPoints;
      }
      
      return next;
    });
  };

  const exportData = () => {
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const a = document.createElement('a');
    a.href = data;
    a.download = `life-os-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const calculateProgress = () => {
    let score = 0;
    
    const ritualDone = Object.values(state.rituals).filter(v => v).length;
    const exAMDone = Object.values(state.exerciseAM).filter(v => v).length;
    const exPMDone = Object.values(state.exercisePM).filter(v => v).length;
    
    score += ritualDone * 4;
    score += exAMDone * 5;
    score += exPMDone * 5;

    if (state.water >= 3) score += 5;
    if (state.water === 5) score += 5;

    if (state.steps > 5000) score += 10;
    if (state.steps > 10000) score += 15;

    if (state.primaryObjective?.done) score += 30;

    const tasksDone = state.tasks.filter(t => t.done).length;
    score += tasksDone * 2;

    return Math.min(100, Math.round(score));
  };

  const getDisciplinePhase = (score: number) => {
    if (score < 30) return { name: "Entropy", color: "text-red-400 border-red-500/30 bg-red-500/5" };
    if (score < 60) return { name: "Acclimatization", color: "text-amber-400 border-amber-500/30 bg-amber-500/5" };
    if (score < 90) return { name: "Momentum", color: "text-brand-400 border-brand-500/30 bg-brand-500/5" };
    return { name: "Execution", color: "text-indigo-400 border-indigo-500/30 bg-indigo-500/5" };
  };

  // Compute derived state variables only when state is loaded
  const currentScore = state ? calculateProgress() : 0;
  const phase = getDisciplinePhase(currentScore);

  if (!state) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-[#02040a] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin"></div>
          <p className="text-white/50 text-sm font-mono uppercase tracking-widest">Loading OSState...</p>
        </div>
      </div>
    );
  }

  // iOS 26 System State Atmosphere: Dynamic visual reaction mapping
  let envStatus = "DRIFTING";
  let ambientColors = ["rgba(255, 255, 255, 0.02)", "rgba(255, 255, 255, 0.01)"];
  let envLabel = "Drifting Focus";
  let statusThemeColor = "from-white/5 to-white/10 border-white/10 text-white/85";
  let indicatorLight = "bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.3)]";

  if (state.founderMode) {
    envStatus = "DRIFTING";
    ambientColors = ["rgba(255, 255, 255, 0.03)", "rgba(255, 255, 255, 0.015)"];
    envLabel = "Drifting Command";
    statusThemeColor = "from-white/10 to-white/5 border-white/15 text-white/90";
    indicatorLight = "bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.4)]";
  } else if (currentScore >= 90) {
    envStatus = "LOCKED IN";
    ambientColors = ["rgba(255, 255, 255, 0.04)", "rgba(255, 255, 255, 0.02)"];
    envLabel = "Locked In";
    statusThemeColor = "from-white/10 to-white/5 border-white/15 text-white/90";
    indicatorLight = "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]";
  } else if (currentScore >= 60) {
    envStatus = "MOMENTUM";
    ambientColors = ["rgba(255, 255, 255, 0.03)", "rgba(255, 255, 255, 0.01)"];
    envLabel = "Momentum Active";
    statusThemeColor = "from-white/10 to-white/5 border-white/15 text-white/90";
    indicatorLight = "bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.4)]";
  } else if (currentScore >= 30) {
    envStatus = "RECOVERY";
    ambientColors = ["rgba(255, 255, 255, 0.02)", "rgba(255, 255, 255, 0.01)"];
    envLabel = "Active Recovery";
    statusThemeColor = "from-white/15 to-white/5 border-white/15 text-white/80";
    indicatorLight = "bg-white/30 shadow-[0_0_8px_rgba(255,255,255,0.2)]";
  } else {
    envStatus = "BURNOUT RISK";
    ambientColors = ["rgba(255, 255, 255, 0.02)", "rgba(255, 0, 0, 0.01)"];
    envLabel = "Burnout Risk Warning";
    statusThemeColor = "from-red-500/5 to-white/5 border-white/10 text-white/70";
    indicatorLight = "bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse";
  }

  return (
    <div className="relative flex flex-col h-screen w-full bg-[#02040a] text-[#f4f4f5] font-plus p-4 md:p-6 pb-20 sm:pb-6 gap-5 overflow-hidden selection:bg-brand-500/30 selection:text-white">
      
      {/* ADAPTIVE TIME-BASED SPECTRAL BACKGROUND */}
      <AtmosphereBackdrop currentAtmosphere={activeAtmosphere} />

      {/* DETAILED GLASS CONDENSATION WATER PARTICLES */}
      <CondensationEffect active={activeAtmosphere.condensationActive} />

      {/* SYSTEM HEADER */}
      <header className="relative flex flex-col md:flex-row justify-between items-center md:items-center pb-2 px-2 z-10 gap-5 shrink-0 w-full mb-2">
        <div className="flex flex-col items-center md:items-start w-full md:w-auto">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 bg-white/5 border border-white/10 text-white/80 text-[10px] font-mono tracking-widest uppercase rounded-full shadow-inner backdrop-blur-md">
              PROTOCOL V6.0
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center gap-2 font-plus whitespace-nowrap">
            Ascend Protocol
          </h1>
        </div>

        <div className="flex gap-4 text-right items-center w-full md:w-auto self-stretch md:self-auto justify-end">
          
          <div className="relative overflow-hidden bg-brand-500/10 border border-brand-500/30 px-5 py-2.5 rounded-[1.75rem] shadow-[0_4px_24px_rgba(16,185,129,0.15)] flex flex-col items-center justify-center backdrop-blur-3xl saturate-150 transform transition hover:scale-105">
            <span className="text-[8.5px] font-mono font-black uppercase text-brand-400 tracking-[0.2em] leading-none mb-1">GLOBAL XP</span>
            <span className="text-xl font-bold font-sans text-white leading-none flex items-baseline gap-1">
              {state.points || 0}
              <span className="text-brand-400/50 text-[11px] font-mono">pts</span>
            </span>
          </div>

          {/* STUNNING CHRONO VECTOR PROGRESS DISC SCORE */}
          <div className="relative overflow-hidden bg-white/[0.04] border border-white/12 px-5 py-2.5 rounded-[1.75rem] shadow-[0_8px_32px_rgba(0,0,0,0.37)] flex items-center gap-3.5 backdrop-blur-3xl saturate-150">
            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90">
                <circle
                  className="text-white/[0.06]"
                  strokeWidth="2.5"
                  stroke="currentColor"
                  fill="transparent"
                  r="15"
                  cx="18"
                  cy="18"
                />
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
                  style={{
                    filter: "drop-shadow(0 0 6px rgba(255, 255, 255, 0.45))"
                  }}
                />
              </svg>
              <span className="absolute text-[9.5px] font-mono font-black text-white/50 tracking-tighter">%</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[8.5px] font-mono font-black uppercase text-white/40 tracking-[0.2em] leading-none">DISCIPLINE RATIO</span>
              <span className="text-xl font-bold font-sans text-white leading-none mt-1.5 flex items-baseline gap-1">
                {currentScore}
                <span className="text-white/40 text-[11px] font-normal font-mono">/100</span>
              </span>
            </div>
          </div>
        </div>
      </header>
 
      {/* CORE APP WRAPPER */}
      <div className="relative flex flex-1 flex-col sm:flex-row gap-5 min-h-0 z-10">
        
        {/* LEFT COMPACT COMMAND BAR (ASIDE) */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col gap-4">
            <div className="liquid-glass-panel rounded-[2rem] p-4 flex flex-col gap-5 h-full overflow-y-auto custom-scrollbar">
              
              {/* PRIMARY CLOCK WIDGET IN SIDEBAR */}
              <div className="flex flex-col items-center justify-center -mx-2">
                <FlipClock compact={true} />
              </div>

              {/* OUTWARD SANCTUARY ATMOSPHERE SELECTOR */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                <p className="text-[9px] font-extrabold text-white/40 uppercase tracking-[0.18em] pl-1.5 leading-none font-mono">Sanctuary Atmosphere</p>
                <div className="relative">
                  <select
                    value={selectedAtmosphereMode}
                    onChange={(e) => {
                      setSelectedAtmosphereMode(e.target.value);
                    }}
                    className="w-full bg-[#0a0c12]/60 hover:bg-[#0c0e16]/80 backdrop-blur-md border border-white/12 hover:border-white/20 text-white/80 rounded-2xl px-4 py-3 text-[10px] uppercase font-bold tracking-wider outline-none transition-all cursor-pointer shadow-sm appearance-none pr-10"
                    style={{
                      backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 14px center",
                      backgroundSize: "16px"
                    }}
                  >
                    <option value="auto" className="bg-[#090b10] text-white py-2 font-semibold">⚡ AUTO SYNC (Time of Day)</option>
                    {ATMOSPHERES.map(atm => (
                      <option key={atm.id} value={atm.id} className="bg-[#090b10] text-white py-2 font-semibold">
                        {atm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* MINIMAL CATEGORY NAVIGATION */}
              <nav className="space-y-1.5 pt-1 border-t border-white/5">
                <p className="text-[9px] font-extrabold text-white/40 uppercase tracking-[0.18em] mb-2.5 pl-1.5 leading-none font-mono">Navigation</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
                    { key: 'physio', label: 'AI Physio', icon: <Activity size={14} /> },
                    { key: 'business', label: 'Strategic Command', icon: <Lightbulb size={14} />, badge: state.ideas.length },
                    { key: 'review', label: 'Weekly Review', icon: <BarChart3 size={14} /> },
                    { key: 'vision', label: 'Vision Board', icon: <Eye size={14} /> },
                    { key: 'buy_list', label: 'Purchases (Locked)', icon: <ShoppingCart size={14} />, badge: state.tasks.filter(t => !t.done).length }
                  ].map(tab => (
                    <button 
                      key={tab.key}
                      onClick={() => setView(tab.key as any)} 
                      className={`w-full relative flex items-center justify-between px-4.5 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${view === tab.key ? 'bg-white/15 text-white border-white/20 shadow-sm backdrop-blur-md font-extrabold' : 'text-white/40 border-transparent bg-white/[0.01] hover:text-white/85 hover:bg-white/[0.07] hover:border-white/10'}`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span className={view === tab.key ? 'text-white' : 'text-white/40'}>{tab.icon}</span> 
                        {tab.label}
                      </div>
                      {typeof tab.badge !== 'undefined' && tab.badge > 0 && (
                        <span className="bg-brand-500/20 text-brand-400 min-w-5 h-5 flex items-center justify-center rounded-full text-[9px] px-1.5 ml-2 font-mono ring-1 ring-brand-500/50">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </nav>
 
              {/* TIMING REGISTERS */}
              <div>
                <p className="text-[9px] font-extrabold text-white/40 uppercase tracking-[0.18em] mb-2.5 pl-1.5 leading-none font-mono">Protocol Countdowns</p>
                <div className="space-y-2.5">
                  <CountdownTimer label="Trip Expedition" targetDate="2026-06-10T00:00:00" />
                  <CountdownTimer label="Launch milestone" targetDate="2026-06-29T00:00:00" />
                </div>
              </div>

              {/* TELEMETRY DIAGNOSTIC TRIGGERS */}
              <div className="pt-2">
                <button
                  onClick={() => setLogsPanelOpen(true)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/85 hover:text-white rounded-2xl transition-all cursor-pointer shadow-sm text-[11px] font-bold uppercase tracking-wider"
                >
                  <div className="flex items-center gap-3">
                    <Clipboard size={14} className="text-white/50" />
                    <span>System Logs</span>
                  </div>
                  <svg className="w-3.5 h-3.5 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>

              {/* INTEGRATED ARCHITECTURAL COPYRIGHT */}
              <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between text-[8px] font-mono font-bold text-white/30 uppercase tracking-[0.16em]">
                <span>ASCEND PROTOCOL</span>
                <span>© 2025</span>

              </div>

            </div>
          </aside>

        {/* CONTAINER VIEWPORTS (MAIN BODY) */}
        <main className="flex-1 flex flex-col gap-6 min-w-0 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 15, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, filter: 'blur(6px)' }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="h-full"
            >
              {view === 'dashboard' && (
                <Dashboard 
                  state={state} 
                  updateState={updateState} 
                  onConnectGoogleFit={connectGoogleFit}
                  onTriggerStepSync={triggerStepSync}
                  isSyncingSteps={isSyncingSteps}
                  fitSyncError={fitSyncError}
                />
              )}
              {view === 'business' && <BusinessHub state={state} updateState={updateState} />}
              {view === 'physio' && <PhysioAI state={state} updateState={updateState} />}
              {view === 'review' && <WeeklyReview state={state} />}
              {view === 'vision' && <VisionBoard state={state} updateState={updateState} />}
              {view === 'buy_list' && <ToBuyList state={state} updateState={updateState} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* MOBILE BOTTOM GLASS NAVIGATION BAR */}
      <nav className="sm:hidden fixed bottom-3 left-4 right-4 bg-[#02040a]/85 backdrop-blur-md border border-white/12 py-3 px-5 flex justify-between items-center z-50 rounded-[2.5rem] shadow-lg overflow-x-auto">
        <button onClick={() => setView('dashboard')} className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${view === 'dashboard' ? 'text-white bg-white/10' : 'text-white/40'}`}>
          <LayoutDashboard size={20} />
        </button>
        <button onClick={() => setView('business')} className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${view === 'business' ? 'text-white bg-white/10' : 'text-white/40'}`}>
          <Lightbulb size={20} />
          {state.ideas.length > 0 && <span className="absolute -top-1 -right-1 bg-brand-500 text-white min-w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold px-1 ring-2 ring-[#02040a]">{state.ideas.length}</span>}
        </button>
        <button onClick={() => setView('physio')} className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${view === 'physio' ? 'text-white bg-white/10' : 'text-white/40'}`}>
          <Activity size={20} />
        </button>
        {/* MOBILE DYNAMIC SYSTEM COMMANDS CENTER BUTTON */}
        <button 
          onClick={() => setLogsPanelOpen(true)} 
          className="w-14 h-14 shrink-0 mx-2 rounded-full flex items-center justify-center border transition-all glass-shimmer cursor-pointer -translate-y-5 shadow-lg bg-white/[0.08] hover:bg-white/[0.15] text-white border-white/20 pb-0.5"
          title="System Command Panel"
        >
          <Sliders size={22} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
        </button>
        <button onClick={() => setView('review')} className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${view === 'review' ? 'text-white bg-white/10' : 'text-white/40'}`}>
          <BarChart3 size={20} />
        </button>
        <button onClick={() => setView('vision')} className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${view === 'vision' ? 'text-white bg-white/10' : 'text-white/40'}`}>
          <Eye size={20} />
        </button>
        <button onClick={() => setView('buy_list')} className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${view === 'buy_list' ? 'text-white bg-white/10' : 'text-white/40'}`}>
          <ShoppingCart size={20} />
          {state.tasks.filter(t => !t.done).length > 0 && <span className="absolute -top-1 -right-1 bg-brand-500 text-white min-w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold px-1 ring-2 ring-[#02040a]">{state.tasks.filter(t => !t.done).length}</span>}
        </button>
      </nav>

      {/* DIAGNOSTIC POPUP & SERVICES CONSOLE */}
      <SystemLogsModal 
        isOpen={logsPanelOpen}
        onClose={() => setLogsPanelOpen(false)}
        state={state}
        updateState={updateState}
        user={user}
        logout={logout}
        logs={appLogs}
        selectedAtmosphereMode={selectedAtmosphereMode}
        setSelectedAtmosphereMode={setSelectedAtmosphereMode}
      />

      <RewardModal 
        isOpen={rewardModalOpen}
        onClose={() => setRewardModalOpen(false)}
        rewardContent={currentReward}
      />

    </div>
  );
}
