import { useState, useEffect } from 'react';
import { OSState, Task } from '../types';
import { RITUALS, HEALTH_STACK, STOIC_QUOTES } from '../constants';
import {
  Droplets,
  Sun,
  Moon,
  Plus,
  Check,
  X,
  ShieldCheck,
  Zap,
  RefreshCw,
  Clipboard,
  ClipboardCheck,
  HelpCircle,
  Activity,
  Award,
  CircleDot,
  Settings2,
  Eye,
  EyeOff,
  Compass,
  Timer,
  Play,
  Square,
  AlignLeft,
  GripVertical,
  Quote,
  Pencil,
  Footprints
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import AnimatedCheckboxItem from './AnimatedCheckboxItem';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  onConnectGoogleFit?: () => void;
  onTriggerStepSync?: () => void;
  isSyncingSteps?: boolean;
  fitSyncError?: string | null;
}

const SIDE_QUESTS = [
  "Drink a large glass of water right now.",
  "Do 20 air squats or 10 push-ups.",
  "Send a message of appreciation to someone.",
  "Take 10 deep, diaphragmatic breaths.",
  "Stretch your hamstrings for 30 seconds.",
  "Wipe down your desk and organize your space.",
  "Write down 3 things you are grateful for.",
  "Walk around your room for 2 minutes.",
  "Look at the furthest object outside for 60 seconds.",
  "Do a solid 60-second plank.",
  "Read one page of a book or an article.",
  "Close your eyes and meditate for 2 minutes.",
  "Review your daily priorities and schedule.",
  "Roll your shoulders and correct your posture.",
  "Stand up and do 10 jumping jacks."
];

const DEFAULT_WIDGETS = [
  { id: 'quote', label: 'Daily Stoic Quote' },
  { id: 'primary_objective', label: 'Primary Objective' },
  { id: 'side_quests', label: 'Side Quests (Daily)' },
  { id: 'activity_tracker', label: 'Activity & Movement' },
  { id: 'workout_stacks', label: 'Workout Stacks' },
  { id: 'rituals', label: 'Daily Rituals' },
  { id: 'daily_tasks', label: 'Daily Tasks' },
  { id: 'hydration', label: 'Hydration Tracker' },
  { id: 'pomodoro', label: 'Focus Timer' },
  { id: 'scratchpad', label: 'Quick Notes' }
];

export default function Dashboard({ 
  state, 
  updateState,
  onConnectGoogleFit,
  onTriggerStepSync,
  isSyncingSteps,
  fitSyncError
}: Props) {
  const [exactUri, setExactUri] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isEditingSteps, setIsEditingSteps] = useState(false);
  const [inputStepsVal, setInputStepsVal] = useState<string>("");

  const [currentQuote] = useState(() => STOIC_QUOTES[Math.floor(Math.random() * STOIC_QUOTES.length)]);

  const customAM = state.customAM || [];
  const customPM = state.customPM || [];

  const [widgetConfig, setWidgetConfig] = useState<{ id: string, visible: boolean }[]>(() => {
    try {
      const saved = localStorage.getItem('ascend_widget_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingIds = new Set(parsed.map((w: any) => w.id));
          const toAdd = DEFAULT_WIDGETS.filter(dw => !existingIds.has(dw.id)).map(dw => ({ id: dw.id, visible: true }));
          return [...parsed, ...toAdd];
        }
      }
    } catch {}
    return DEFAULT_WIDGETS.map(w => ({ id: w.id, visible: true }));
  });
  const [isEditingWidgets, setIsEditingWidgets] = useState(false);

  useEffect(() => {
    localStorage.setItem('ascend_widget_config', JSON.stringify(widgetConfig));
  }, [widgetConfig]);

  const toggleWidget = (id: string) => {
    setWidgetConfig(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const moveWidget = (index: number, direction: -1 | 1) => {
    const newConfig = [...widgetConfig];
    if (index + direction >= 0 && index + direction < newConfig.length) {
      const temp = newConfig[index];
      newConfig[index] = newConfig[index + direction];
      newConfig[index + direction] = temp;
      setWidgetConfig(newConfig);
    }
  };

  const handleStartEditingSteps = () => {
    setInputStepsVal((state.steps || 0).toString());
    setIsEditingSteps(true);
  };

  const handleSaveSteps = () => {
    const parsed = parseInt(inputStepsVal, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      updateState(prev => ({ ...prev, steps: parsed }));
    }
    setIsEditingSteps(false);
  };

  useEffect(() => {
    // Fetch the exact redirect URI from the server
    const origin = window.location.origin;
    fetch(`/api/auth/google/url?origin=${encodeURIComponent(origin)}`)
      .then(res => res.json())
      .then(data => {
        if (data.exactRedirectUri) setExactUri(data.exactRedirectUri);
      })
      .catch(console.error);
  }, []);

  const handleCopyUri = () => {
    const uriToCopy = exactUri || `${window.location.origin}/api/auth/callback/google`;
    navigator.clipboard.writeText(uriToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleRitual = (id: string) => {
    updateState(prev => ({
      ...prev,
      rituals: { ...prev.rituals, [id]: !prev.rituals[id] }
    }));
  };

  const toggleExercise = (id: string, session: 'AM' | 'PM') => {
    const key = session === 'AM' ? 'exerciseAM' : 'exercisePM';
    updateState(prev => ({
      ...prev,
      [key]: { ...prev[key], [id]: !prev[key][id] }
    }));
  };

  const addTask = () => {
    const text = prompt("Enter new task:");
    if (text) {
      updateState(prev => ({
        ...prev,
        tasks: [...prev.tasks, { id: Math.random().toString(36).substr(2, 9), text, done: false }]
      }));
    }
  };

  const toggleTask = (id: string) => {
    updateState(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
    }));
  };

  const deleteTask = (id: string) => {
    updateState(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== id)
    }));
  };

  const setPrimary = () => {
    const text = prompt("WHAT IS YOUR PRIMARY OBJECTIVE TODAY?");
    if (text) {
      updateState(prev => ({ ...prev, primaryObjective: { text, done: false } }));
    }
  };

  const togglePrimary = () => {
    updateState(prev => {
      if (!prev.primaryObjective) return prev;
      return { ...prev, primaryObjective: { ...prev.primaryObjective, done: !prev.primaryObjective.done } };
    });
  };

  const [currentQuest, setCurrentQuest] = useState("");
  const [questsCompleted, setQuestsCompleted] = useState(() => {
    try {
      const saved = localStorage.getItem('ascend_quests_completed_today');
      const todayStr = new Date().toISOString().split('T')[0];
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === todayStr) return parsed.count;
      }
    } catch {}
    return 0;
  });

  useEffect(() => {
    localStorage.setItem('ascend_quests_completed_today', JSON.stringify({
      count: questsCompleted,
      date: new Date().toISOString().split('T')[0]
    }));
  }, [questsCompleted]);

  useEffect(() => {
    setCurrentQuest(SIDE_QUESTS[Math.floor(Math.random() * SIDE_QUESTS.length)]);
  }, []);

  const completeQuest = () => {
    setQuestsCompleted((p: number) => p + 1);
    
    // Add point globally
    updateState(prev => ({
      ...prev,
      points: (prev.points || 0) + 1
    }));

    let nextQuest = SIDE_QUESTS[Math.floor(Math.random() * SIDE_QUESTS.length)];
    while (nextQuest === currentQuest) {
       nextQuest = SIDE_QUESTS[Math.floor(Math.random() * SIDE_QUESTS.length)];
    }
    setCurrentQuest(nextQuest);
  };
  
  const rerollQuest = () => {
    let nextQuest = SIDE_QUESTS[Math.floor(Math.random() * SIDE_QUESTS.length)];
    while (nextQuest === currentQuest) {
       nextQuest = SIDE_QUESTS[Math.floor(Math.random() * SIDE_QUESTS.length)];
    }
    setCurrentQuest(nextQuest);
  };

  const [waterGlasses, setWaterGlasses] = useState(() => {
    try {
      const saved = localStorage.getItem('ascend_water_glasses');
      const todayStr = new Date().toISOString().split('T')[0];
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === todayStr) return parsed.count || 0;
      }
    } catch {}
    return 0;
  });

  const updateWater = (val: number) => {
    setWaterGlasses(val);
    updateState(prev => ({
      ...prev,
      water: val
    }));
  };

  useEffect(() => {
    localStorage.setItem('ascend_water_glasses', JSON.stringify({
      count: waterGlasses,
      date: new Date().toISOString().split('T')[0]
    }));
  }, [waterGlasses]);

  const [pomoTime, setPomoTime] = useState(25 * 60);
  const [pomoRunning, setPomoRunning] = useState(false);

  useEffect(() => {
    let interval: any;
    if (pomoRunning && pomoTime > 0) {
      interval = setInterval(() => {
        setPomoTime(p => p - 1);
      }, 1000);
    } else if (pomoTime === 0) {
      setPomoRunning(false);
    }
    return () => clearInterval(interval);
  }, [pomoRunning, pomoTime]);

  const togglePomo = () => setPomoRunning(!pomoRunning);
  const resetPomo = () => { setPomoRunning(false); setPomoTime(25 * 60); };

  const [scratchpad, setScratchpad] = useState(() => {
    return localStorage.getItem('ascend_scratchpad') || "";
  });

  useEffect(() => {
    localStorage.setItem('ascend_scratchpad', scratchpad);
  }, [scratchpad]);
  
  const [draggedWidgetIdx, setDraggedWidgetIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedWidgetIdx(index);
    e.dataTransfer.effectAllowed = "move";
    // We can set data to an empty string because it's required for firefox
    e.dataTransfer.setData("text/plain", "");
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedWidgetIdx === null || draggedWidgetIdx === index) return;
    
    setWidgetConfig(prev => {
      const newConfig = [...prev];
      const draggedItem = newConfig[draggedWidgetIdx];
      newConfig.splice(draggedWidgetIdx, 1);
      newConfig.splice(index, 0, draggedItem);
      return newConfig;
    });
    setDraggedWidgetIdx(null);
  };

  const renderWidgetContent = (id: string) => {
    switch (id) {
      case 'quote':
        return (
          <div className="w-full flex flex-col items-center justify-center py-4 sm:py-6 relative z-10 transition-all liquid-glass-panel rounded-[2rem]">
            <div className="max-w-lg text-center px-4 flex flex-col items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
              <Quote size={20} className="text-white/10 mb-1" />
              <p className="text-xs lg:text-sm font-serif italic text-white/80 tracking-wide leading-relaxed">
                "{currentQuote.split(' - ')[0]}"
              </p>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold text-white/30">
                — {currentQuote.split(' - ')[1]}
              </p>
            </div>
          </div>
        );
      case 'side_quests':
        return (
          <div className="w-full">
            <div className="bg-white/[0.02] backdrop-blur-[24px] saturate-125 border border-white/12 rounded-[2rem] shadow-[15px_15px_30px_rgba(0,0,0,0.4)] p-6 relative overflow-hidden flex flex-col items-center text-center">
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/[0.02] via-transparent to-emerald-500/[0.05] pointer-events-none" />
              <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.25em] text-emerald-400 mb-4 flex items-center gap-2 relative z-10">
                <Compass size={14} /> SIDE QUEST
              </h3>
              <p className="text-sm font-semibold text-white/90 mb-6 max-w-sm h-14 flex items-center justify-center relative z-10 leading-relaxed">
                {currentQuest}
              </p>
              <div className="flex items-center gap-3 w-full max-w-xs relative z-10">
                <button 
                  onClick={rerollQuest}
                  className="px-4 py-3.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all basis-1/3 flex items-center justify-center"
                >
                  <RefreshCw size={14} />
                </button>
                <button 
                  onClick={completeQuest}
                  className="px-4 py-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] active:scale-95 flex-1"
                >
                  Complete (+1 EXP)
                </button>
              </div>
              {questsCompleted > 0 && <p className="text-[9px] font-mono text-white/30 tracking-widest mt-5 relative z-10">COMPLETED TODAY: <span className="text-emerald-400 font-bold">{questsCompleted}</span></p>}
            </div>
          </div>
        );
      case 'primary_objective':
        return (
          <div className="grid grid-cols-12 gap-5 items-stretch w-full">
            <div className="col-span-12 flex h-full">
              <div className="bg-white/[0.02] backdrop-blur-[24px] saturate-125 border border-white/12 rounded-[2rem] shadow-[20px_20px_40px_rgba(0,0,0,0.5),_inset_0_1px_1px_rgba(255,255,255,0.1)] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group hover:border-white/18 transition-all duration-500 w-full min-h-[180px]">
                <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.005] via-transparent to-white/[0.03] pointer-events-none" />
                
                <div className="text-center text-[10px] font-mono font-black uppercase tracking-[0.25em] text-white/35 flex items-center justify-center gap-2">
                  <span className="h-[1px] w-6 bg-white/10" />
                  PRIMARY OBJECTIVE
                  <span className="h-[1px] w-6 bg-white/10" />
                </div>

                {!state.primaryObjective ? (
                  <button 
                    onClick={setPrimary}
                    className="flex-1 flex flex-col items-center justify-center gap-3 py-6 text-white/50 hover:text-white transition-colors cursor-pointer group/btn focus:outline-none"
                  >
                    <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/[0.02] group-hover/btn:border-white/30 group-hover/btn:scale-105 transition-all duration-300">
                      <Plus size={18} className="text-white/45" />
                    </div>
                    <span className="text-[11px] uppercase font-black tracking-[0.2em] text-white/55 font-mono">DEFINE DAILY MISSION</span>
                  </button>
                ) : (
                  <div 
                    onClick={togglePrimary}
                    className="flex-1 flex flex-col items-center justify-center gap-2.5 py-4 text-center cursor-pointer group/active"
                  >
                    <div className={`w-13 h-13 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${state.primaryObjective.done ? 'border-white bg-white text-black shadow-md' : 'border-white/15 text-transparent group-hover/active:scale-105 group-hover/active:border-white/40'}`}>
                      <Check size={20} strokeWidth={4} className={state.primaryObjective.done ? 'text-black opacity-100' : 'opacity-0'} />
                    </div>
                    <div className="space-y-1 px-4">
                      <h2 className={`text-xl sm:text-2xl font-extrabold tracking-tight leading-snug drop-shadow-sm ${state.primaryObjective.done ? 'text-white/30 line-through' : 'text-white'}`}>
                        {state.primaryObjective.text}
                      </h2>
                      <span className="text-[9px] font-mono text-white/35 italic block mt-0.5">
                        {state.primaryObjective.done ? 'COMPLETED' : 'Stay Focused'}
                      </span>
                    </div>
                  </div>
                )}
                
                {state.primaryObjective && !state.primaryObjective.done && (
                  <div className="absolute top-0 right-0 w-80 h-80 bg-white/[0.005] rounded-full blur-[80px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />
                )}
              </div>
            </div>
          </div>
        );
      case 'activity_tracker': {
        const steps = state.steps || 0;
        const stepGoal = 10000;
        const stepPct = Math.min(100, (steps / stepGoal) * 100);
        const goalReached = steps >= stepGoal;
        const lastSync = state.fitLastSync
          ? new Date(state.fitLastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;
        return (
          <div className="w-full space-y-3">
            <div className={`bg-white/[0.02] backdrop-blur-[24px] saturate-125 border rounded-[2rem] shadow-[15px_15px_30px_rgba(0,0,0,0.4)] p-5 flex flex-col gap-4 transition-all duration-500 ${goalReached ? 'border-emerald-500/25' : 'border-white/12'}`}>

              {/* Top row */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Left: icon + count */}
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 border rounded-xl flex items-center justify-center shadow-inner transition-all duration-500 ${goalReached ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.04] border-white/10'}`}>
                    <Footprints size={20} className={goalReached ? 'text-emerald-400' : 'text-white/80'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[8.5px] font-mono font-bold text-white/40 uppercase tracking-[0.2em]">Steps Today</span>
                      {goalReached && (
                        <span className="text-[8px] font-mono font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                          ✓ Goal Hit
                        </span>
                      )}
                    </div>
                    {isEditingSteps ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          id="steps-manual-input"
                          value={inputStepsVal}
                          onChange={(e) => setInputStepsVal(e.target.value)}
                          className="bg-[#0a0c10]/80 border border-white/20 text-white font-mono text-xs font-bold rounded-lg px-2.5 py-1 w-24 outline-none focus:border-white/45"
                          placeholder="0"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveSteps();
                            if (e.key === 'Escape') setIsEditingSteps(false);
                          }}
                          autoFocus
                        />
                        <button onClick={handleSaveSteps} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white"><Check size={12} /></button>
                        <button onClick={() => setIsEditingSteps(false)} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/60"><X size={12} /></button>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <h4
                          onClick={handleStartEditingSteps}
                          className={`text-xl font-black tracking-tight cursor-pointer select-none transition-colors duration-300 ${goalReached ? 'text-emerald-400' : 'text-white'}`}
                        >
                          {steps.toLocaleString()}
                        </h4>
                        <span className="text-white/30 text-xs font-normal">/ {stepGoal.toLocaleString()}</span>
                        <button
                          onClick={handleStartEditingSteps}
                          title="Enter steps manually"
                          className="text-white/20 hover:text-white/60 transition-colors ml-0.5 cursor-pointer"
                        >
                          <Pencil size={10} />
                        </button>
                      </div>
                    )}
                    {lastSync && state.isFitConnected && (
                      <span className="text-[9px] text-white/25 font-mono mt-0.5 block">
                        Last sync: {lastSync}
                      </span>
                    )}
                    {!state.isFitConnected && (
                      <span className="text-[9px] text-white/25 font-mono mt-0.5 block">
                        Tap the pencil to enter steps manually
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {state.isFitConnected ? (
                    <>
                      <button
                        onClick={onTriggerStepSync}
                        disabled={isSyncingSteps}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.1] text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all border border-white/10 disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        <RefreshCw size={11} className={isSyncingSteps ? 'animate-spin text-white/50' : ''} />
                        {isSyncingSteps ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button
                        onClick={onConnectGoogleFit}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-white/5 hover:bg-white/12 text-white/60 hover:text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all border border-white/5 cursor-pointer"
                      >
                        Reconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={onConnectGoogleFit}
                      className="flex items-center gap-2 px-5 py-3 bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/15 hover:border-white/25 rounded-2xl text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all cursor-pointer shadow-sm"
                    >
                      <Zap size={12} className="text-amber-400" />
                      Connect Google Fit
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar with milestones */}
              <div className="space-y-1.5">
                <div className="relative h-2.5 bg-white/[0.03] border border-white/8 rounded-full overflow-hidden shadow-inner">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${stepPct}%` }}
                    transition={{ type: 'spring', stiffness: 80, damping: 20 }}
                    className={`h-full rounded-full transition-colors duration-500 ${goalReached ? 'bg-gradient-to-r from-emerald-600/70 to-emerald-400' : 'bg-gradient-to-r from-white/10 via-white/40 to-white/85'}`}
                  />
                  {[25, 50, 75].map(pct => (
                    <div key={pct} className="absolute top-0 bottom-0 w-px bg-white/10 pointer-events-none" style={{ left: `${pct}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-[8.5px] font-mono text-white/25">
                  <span>0</span>
                  <span>2.5k</span>
                  <span>5k</span>
                  <span>7.5k</span>
                  <span className={goalReached ? 'text-emerald-400 font-bold' : ''}>10k</span>
                </div>
              </div>
            </div>

            {fitSyncError && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-[2rem] p-6 space-y-5 shadow-2xl relative overflow-hidden">
                <p className="text-[10.5px] text-white/60 leading-relaxed font-sans">{fitSyncError}</p>
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <p className="text-[9.5px] font-mono font-bold text-white/40 uppercase tracking-widest">Authorized Redirect URI:</p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <span className="flex-1 font-mono text-[10.5px] bg-black/50 px-4 py-3.5 rounded-xl border border-white/8 text-white/85 select-all overflow-x-auto whitespace-nowrap shadow-sm">
                      {exactUri || `${window.location.origin}/api/auth/callback/google`}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }
      case 'workout_stacks':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
            {/* AM ROUTINE MOBILITY STACK */}
            <div className="bg-white/[0.02] backdrop-blur-[24px] saturate-125 border border-white/12 rounded-[2rem] p-6.5 flex flex-col justify-between hover:border-white/15 transition-all duration-300 group shadow-lg min-h-[380px]">
              <div>
                <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-widest font-mono">
                    <Sun size={15} className="text-amber-400" /> Morning Workout
                  </h3>
                </div>
                <div className="space-y-2.5">
                  {HEALTH_STACK.map(ex => (
                    <AnimatedCheckboxItem key={`am-${ex.id}`} id={ex.id} name={ex.name} isDone={!!state.exerciseAM[ex.id]} onToggle={(id) => toggleExercise(id, 'AM')} className="!p-3.5 !rounded-2xl" />
                  ))}
                  {customAM.map((taskName) => (
                     <AnimatedCheckboxItem key={`am-custom-${taskName}`} id={taskName} name={taskName} isDone={!!state.exerciseAM[taskName]} onToggle={(id) => toggleExercise(id, 'AM')} onDelete={(id) => updateState(prev => ({ ...prev, customAM: (prev.customAM || []).filter(t => t !== id) }))} className="!p-3.5 !rounded-2xl" />
                  ))}
                </div>
              </div>
              <button 
                onClick={() => { const text = prompt("Enter morning workout target:"); if (text) updateState(prev => ({ ...prev, customAM: [...(prev.customAM || []), text] })); }}
                className="w-full py-3.5 border border-dashed border-white/10 hover:border-white/25 rounded-[1.2rem] text-[9.5px] font-mono font-bold uppercase tracking-widest text-white/45 hover:text-white/75 transition-all cursor-pointer mt-5 bg-white/[0.005] hover:bg-white/[0.02]"
              >+ ADD TARGET</button>
            </div>

            {/* PM ROUTINE STRENGTH STACK */}
            <div className="bg-white/[0.02] backdrop-blur-[24px] saturate-125 border border-white/12 rounded-[2rem] p-6.5 flex flex-col justify-between hover:border-white/15 transition-all duration-300 group shadow-lg min-h-[380px]">
              <div>
                <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-widest font-mono">
                    <Moon size={15} className="text-indigo-300" /> Evening Workout
                  </h3>
                </div>
                <div className="space-y-2.5">
                  {HEALTH_STACK.map(ex => (
                    <AnimatedCheckboxItem key={`pm-${ex.id}`} id={ex.id} name={ex.name} isDone={!!state.exercisePM[ex.id]} onToggle={(id) => toggleExercise(id, 'PM')} className="!p-3.5 !rounded-2xl" />
                  ))}
                  {customPM.map((taskName) => (
                    <AnimatedCheckboxItem key={`pm-custom-${taskName}`} id={taskName} name={taskName} isDone={!!state.exercisePM[taskName]} onToggle={(id) => toggleExercise(id, 'PM')} onDelete={(id) => updateState(prev => ({ ...prev, customPM: (prev.customPM || []).filter(t => t !== id) }))} className="!p-3.5 !rounded-2xl" />
                  ))}
                </div>
              </div>
              <button 
                onClick={() => { const text = prompt("Enter evening workout target:"); if (text) updateState(prev => ({ ...prev, customPM: [...(prev.customPM || []), text] })); }}
                className="w-full py-3.5 border border-dashed border-white/10 hover:border-white/25 rounded-[1.2rem] text-[9.5px] font-mono font-bold uppercase tracking-widest text-white/45 hover:text-white/75 transition-all cursor-pointer mt-5 bg-white/[0.005] hover:bg-white/[0.02]"
              >+ ADD TARGET</button>
            </div>
          </div>
        );
      case 'rituals':
        return (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
            {[
              { key: 'morning', label: 'Morning Rituals', icon: <Zap size={11} />, color: 'text-white' },
              { key: 'growth', label: 'Growth Rituals', icon: <Award size={11} />, color: 'text-white' },
              { key: 'evening', label: 'Evening Rituals', icon: <Moon size={11} />, color: 'text-white' }
            ].map(cat => (
              <div key={cat.key} className="liquid-glass-panel rounded-[2rem] p-5 flex flex-col hover:bg-white/[0.04] transition-all duration-300">
                <h4 className={`flex items-center gap-2 ${cat.color} font-extrabold uppercase text-[10px] tracking-widest mb-4 border-b border-white/5 pb-2.5`}>
                  {cat.icon} {cat.label}
                </h4>
                <div className="space-y-2 flex-1">
                  {RITUALS.filter(r => r.category === cat.key).map(ritual => {
                    const isDone = !!state.rituals[ritual.id];
                    return (
                      <motion.div 
                        layout
                        key={ritual.id} 
                        onClick={() => toggleRitual(ritual.id)}
                        initial={false}
                        animate={{
                          scale: isDone ? 0.98 : 1,
                          opacity: isDone ? 0.5 : 1,
                          backgroundColor: isDone ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                          borderColor: isDone ? "rgba(255,255,255,0)" : "rgba(255,255,255,0.1)",
                        }}
                        className="flex justify-between items-center p-3 rounded-xl transition-all cursor-pointer group"
                      >
                        <span className={`text-[11px] font-semibold tracking-wide transition-colors duration-300 ${isDone ? 'line-through text-white/30' : 'text-white/75 group-hover:text-white drop-shadow-sm'}`}>{ritual.name}</span>
                        <div className={`w-4.5 h-4.5 rounded-full border transition-all duration-300 flex items-center justify-center ${isDone ? 'bg-white border-transparent text-black' : 'border-white/20'}`}>
                          <AnimatePresence>
                            {isDone && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                              >
                                <Check size={11} strokeWidth={4.5} className="text-black" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        );
      case 'daily_tasks':
        return (
          <section className="liquid-glass-panel rounded-[2.2rem] p-6 shadow-2xl flex flex-col w-full h-full min-h-[170px]">
            <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
              <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
                <CircleDot size={14} className="text-white/40" /> Daily Tasks
              </h3>
              <button 
                onClick={addTask}
                className="text-[10px] px-3.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors font-bold tracking-widest uppercase shadow-md cursor-pointer"
              >
                + Add Task
              </button>
            </div>
            
            <div className="flex-1 space-y-2.5">
              {state.tasks.map((task) => (
                <AnimatedCheckboxItem key={task.id} id={task.id} name={task.text} isDone={task.done} onToggle={toggleTask} onDelete={deleteTask} className="!p-3.5" />
              ))}
              {state.tasks.length === 0 && (
                <div className="h-[100px] flex flex-col items-center justify-center">
                  <p className="text-white/20 text-[10px] font-bold tracking-widest uppercase">No pending tasks.</p>
                </div>
              )}
            </div>
          </section>
        );
      case 'hydration':
        return (
          <section className="liquid-glass-panel rounded-[2.2rem] p-6 shadow-2xl flex flex-col w-full">
            <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-baseline gap-2 mb-4">
              <Droplets size={14} className="text-blue-400" /> Hydration Tracker
            </h3>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => updateWater(Math.max(0, waterGlasses - 1))}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/50 transition-all cursor-pointer"
              >
                -
              </button>
              <div className="flex-1 flex gap-2 justify-center flex-wrap">
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.div
                    key={`water-${i}`}
                    initial={false}
                    animate={{ scale: i < waterGlasses ? 1 : 0.9, opacity: i < waterGlasses ? 1 : 0.3 }}
                    onClick={() => updateWater(i + 1)}
                    className="w-8 h-10 rounded-b-xl border-b-2 border-white/20 bg-blue-500/10 cursor-pointer overflow-hidden relative"
                  >
                    <motion.div 
                      className="absolute bottom-0 w-full bg-blue-400/50"
                      initial={false}
                      animate={{ height: i < waterGlasses ? '100%' : '0%' }}
                      transition={{ type: 'spring' }}
                    />
                  </motion.div>
                ))}
              </div>
              <button 
                onClick={() => updateWater(waterGlasses + 1)}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/50 transition-all cursor-pointer"
              >
                +
              </button>
            </div>
            {waterGlasses >= 8 && <p className="text-center text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-4">Hydration Goal Reached!</p>}
          </section>
        );
      case 'pomodoro':
        const formatTime = (secs: number) => {
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };
        return (
          <section className="liquid-glass-panel rounded-[2.2rem] p-6 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/[0.02] via-transparent to-rose-500/[0.05] pointer-events-none" />
            <h3 className="text-[10px] font-mono font-black uppercase tracking-[0.25em] text-rose-400 mb-2 flex items-center gap-2">
              <Timer size={14} /> Focus Timer
            </h3>
            <div className="text-5xl font-mono text-white tracking-widest font-bold my-4">
              {formatTime(pomoTime)}
            </div>
            <div className="flex gap-4">
              <button 
                onClick={togglePomo}
                className="px-6 py-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-xl font-bold uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2"
              >
                {pomoRunning ? <Square size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
                {pomoRunning ? 'Pause' : 'Start'}
              </button>
              <button 
                onClick={resetPomo}
                className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white/50 rounded-xl transition-all cursor-pointer"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </section>
        );
      case 'scratchpad':
        return (
          <section className="liquid-glass-panel rounded-[2.2rem] p-6 shadow-2xl flex flex-col h-full min-h-[220px]">
            <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2 mb-4">
              <AlignLeft size={14} className="text-white/40" /> Quick Notes
            </h3>
            <textarea
              value={scratchpad}
              onChange={e => setScratchpad(e.target.value)}
              placeholder="Dump thoughts here..."
              className="flex-1 w-full bg-transparent text-white/80 placeholder:text-white/20 resize-none outline-none font-mono text-xs leading-relaxed"
            />
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 flex flex-col pb-8">
      {/* Settings Header */}
      <div className="flex justify-end pt-2">
        <button 
          onClick={() => setIsEditingWidgets(!isEditingWidgets)}
          className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all shadow-sm active:scale-95 border cursor-pointer ${isEditingWidgets ? 'bg-white/20 text-white border-white/30' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10 border-white/5 hover:border-white/15'}`}
        >
          <Settings2 size={13} /> {isEditingWidgets ? 'Done' : 'Customize Widgets'}
        </button>
      </div>

      <AnimatePresence>
        {isEditingWidgets && (
          <motion.div 
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            className="w-full"
          >
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl">
              <h3 className="text-[11px] font-bold font-plus text-white tracking-widest uppercase mb-4">Dashboard Layout</h3>
              <div className="space-y-2">
                {widgetConfig.map((widget, index) => {
                  const def = DEFAULT_WIDGETS.find(w => w.id === widget.id);
                  return (
                    <motion.div 
                      key={widget.id}
                      layout
                      draggable
                      onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, index)}
                      onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, index)}
                      onDrop={(e) => handleDrop(e as unknown as React.DragEvent, index)}
                      className={`flex items-center justify-between p-3 rounded-xl border group transition-all ${draggedWidgetIdx === index ? 'opacity-50 border-dashed border-white/30 bg-transparent' : 'bg-white/[0.03] border-white/5'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/60 p-1">
                          <GripVertical size={16} />
                        </div>
                        <span className={`text-[11px] font-semibold tracking-wide uppercase ${widget.visible ? 'text-white/80' : 'text-white/30 line-through'}`}>{def?.label}</span>
                      </div>
                      <button 
                        onClick={() => toggleWidget(widget.id)}
                        className={`p-2 rounded-lg border transition-all cursor-pointer ${widget.visible ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/10 text-white/30'}`}
                        title={widget.visible ? "Hide Widget" : "Show Widget"}
                      >
                        {widget.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6 flex flex-col w-full">
        {widgetConfig.map(widget => {
          if (!widget.visible) return null;
          return (
            <motion.div key={widget.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {renderWidgetContent(widget.id)}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
