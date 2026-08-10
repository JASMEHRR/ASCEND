/**
 * First-run setup.
 *
 * Shown once for a new account (OSState.setupComplete), and re-runnable from
 * Settings. The point is that the decisions which are annoying to discover
 * later — what Jarvis calls you, whether it speaks at all, whether it's
 * allowed to speak when you didn't ask, and which modules clutter your
 * sidebar — get made deliberately up front instead of being defaults the
 * user never finds.
 *
 * Voice settings live in localStorage (via useVoice) because they're
 * per-device: the same account on a laptop and a phone reasonably wants
 * different answers about speaking out loud. Name and modules are per-account
 * and sync through OSState.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Volume2, VolumeX, Play, Sparkles } from 'lucide-react';
import type { OSState } from '../types';
import { FEATURES, type FeatureId } from '../features/registry';
import { useJarvis } from '../features/jarvis/engine/JarvisProvider';
import { ELEVEN_PREFIX, ELEVEN_VOICES } from '../features/jarvis/voice/useVoice';
import JarvisOrb from '../features/jarvis/ui/JarvisOrb';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
  /** Suggested name when nothing is set yet — the email's local part. */
  fallbackName: string;
  onDone: () => void;
}

const STEPS = ['You', 'Voice', 'Interruptions', 'Modules'] as const;

export default function SetupWizard({ state, updateState, fallbackName, onDone }: Props) {
  const { voice } = useJarvis();
  const [step, setStep] = useState(0);

  const [name, setName] = useState(state.displayName ?? fallbackName);
  // `muted` is the "should Jarvis speak at all" switch already used app-wide.
  const [voiceOn, setVoiceOn] = useState(!voice.muted);
  const [voiceId, setVoiceId] = useState(voice.voiceURI ?? `${ELEVEN_PREFIX}${ELEVEN_VOICES[0].id}`);
  const [proactive, setProactive] = useState(voice.speakProactive);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {};
    for (const f of FEATURES) {
      if (f.core || f.status !== 'active') continue;
      base[f.id] = state.features?.[f.id] ?? f.defaultEnabled;
    }
    return base;
  });

  const toggleModule = (id: FeatureId) => setEnabled((e) => ({ ...e, [id]: !e[id] }));

  const pickVoice = (uri: string) => {
    setVoiceId(uri);
    voice.setVoiceURI(uri);
  };

  const testVoice = () => {
    if (voice.muted) voice.toggleMuted();
    voice.speak("Systems online. This is how I'll sound.");
  };

  const finish = () => {
    // Voice prefs are per-device, so they go straight through useVoice.
    if (voice.muted === voiceOn) voice.toggleMuted();
    voice.setVoiceURI(voiceId);
    voice.setSpeakProactiveValue(proactive);

    updateState((s) => ({
      ...s,
      displayName: name.trim() || undefined,
      features: { ...(s.features ?? {}), ...enabled },
      setupComplete: true,
    }));
    onDone();
  };

  const next = () => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1));

  /**
   * Leave without changing anything, but stop asking.
   *
   * This exists because the wizard shows for anyone without `setupComplete`,
   * which includes every account that predates it — so without an escape it
   * would trap existing users behind four steps of settings they'd already
   * chosen, with no way through to the app.
   */
  const skip = useCallback(() => {
    updateState((s) => ({ ...s, setupComplete: true }));
    onDone();
  }, [updateState, onDone]);

  // Escape is the reflex for "get me out of this modal".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  return (
    // Deliberately see-through: the atmosphere and the app behind stay
    // visible, so setup reads as a layer over Ascend rather than a separate
    // opaque screen bolted on in front of it.
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-2xl">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 26 }}
        className="liquid-glass-highlight relative my-auto w-full max-w-lg overflow-hidden rounded-[2rem] p-6 shadow-[0_40px_90px_-12px_rgba(0,0,0,0.75)] sm:p-8"
      >
        {/* Specular top edge — the tell that a surface is glass rather than
            merely translucent. */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.10),_transparent_60%)]" />
        {/* Progress */}
        <div className="relative mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col gap-1.5">
              <span
                className={`h-1 rounded-full transition-colors ${i <= step ? 'bg-brand-400' : 'bg-white/12'}`}
              />
              <span
                className={`text-[9px] font-mono font-bold uppercase tracking-wider transition-colors ${
                  i === step ? 'text-brand-400' : 'text-white/30'
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22 }}
            className="relative min-h-[280px]"
          >
            {step === 0 && (
              <div className="flex flex-col items-center text-center">
                <JarvisOrb state="idle" size={72} />
                <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-white">What should I call you?</h2>
                <p className="mt-2 text-[13px] text-white/50">
                  Used when Jarvis addresses you. You can change it later in Settings.
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && next()}
                  placeholder="Your name"
                  autoFocus
                  className="mt-6 w-full max-w-xs rounded-xl border border-white/12 bg-[#05070c] px-4 py-3 text-center text-[15px] text-white placeholder-white/25 outline-none focus:border-brand-500/60"
                />
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">Should Jarvis speak?</h2>
                <p className="mt-2 text-[13px] text-white/50">
                  Replies can be spoken aloud, or stay text-only. Either way you can always talk to it.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setVoiceOn(true)}
                    className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                      voiceOn ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                    }`}
                  >
                    <Volume2 size={17} className={voiceOn ? 'text-brand-400' : 'text-white/50'} />
                    <span className="text-[13px] font-bold text-white">Speak replies</span>
                    <span className="text-[11px] text-white/45">You'll hear Jarvis answer.</span>
                  </button>
                  <button
                    onClick={() => setVoiceOn(false)}
                    className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                      !voiceOn ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                    }`}
                  >
                    <VolumeX size={17} className={!voiceOn ? 'text-brand-400' : 'text-white/50'} />
                    <span className="text-[13px] font-bold text-white">Stay silent</span>
                    <span className="text-[11px] text-white/45">Text replies only.</span>
                  </button>
                </div>

                {voiceOn && (
                  <div className="mt-5">
                    <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">
                      Pick a voice
                    </p>
                    <div className="space-y-1.5">
                      {ELEVEN_VOICES.map((v) => {
                        const uri = `${ELEVEN_PREFIX}${v.id}`;
                        const active = voiceId === uri;
                        return (
                          <button
                            key={v.id}
                            onClick={() => pickVoice(uri)}
                            className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                              active ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/8 bg-white/[0.02] hover:border-white/20'
                            }`}
                          >
                            <span
                              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                                active ? 'border-brand-400 bg-brand-400 text-black' : 'border-white/25'
                              }`}
                            >
                              {active && <Check size={10} strokeWidth={4} />}
                            </span>
                            <span className="flex-1 text-[12.5px] text-white/85">{v.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={testVoice}
                      className="mt-3 flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11.5px] font-bold text-white/75 transition-all hover:bg-white/[0.1] cursor-pointer"
                    >
                      <Play size={12} /> Hear it
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">
                  May Jarvis speak up on its own?
                </h2>
                <p className="mt-2 text-[13px] text-white/50">
                  Reminders, nudges and the greeting when you log in. Notifications still appear on screen
                  either way — this only controls whether they're read aloud.
                </p>
                <div className="mt-5 space-y-2.5">
                  <button
                    onClick={() => setProactive(false)}
                    className={`flex w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                      !proactive ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                    }`}
                  >
                    <span className="text-[13.5px] font-bold text-white">Only when I talk to it</span>
                    <span className="text-[11.5px] text-white/45">
                      Jarvis stays quiet unless you ask it something. Recommended.
                    </span>
                  </button>
                  <button
                    onClick={() => setProactive(true)}
                    className={`flex w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                      proactive ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                    }`}
                  >
                    <span className="text-[13.5px] font-bold text-white">Let it speak up</span>
                    <span className="text-[11.5px] text-white/45">
                      Reminders and insights are read aloud as they arrive.
                    </span>
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">What do you want to use?</h2>
                <p className="mt-2 text-[13px] text-white/50">
                  Only what you pick shows up in the sidebar. Everything here can be turned on later.
                </p>
                <div className="mt-5 max-h-[260px] space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
                  {FEATURES.filter((f) => !f.core && f.status === 'active').map((f) => {
                    const Icon = f.icon;
                    const on = enabled[f.id];
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleModule(f.id)}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                          on ? 'border-brand-400/40 bg-brand-500/10' : 'border-white/8 bg-white/[0.02] hover:border-white/20'
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                            on ? 'border-brand-400 bg-brand-400 text-black' : 'border-white/25'
                          }`}
                        >
                          {on && <Check size={10} strokeWidth={4} />}
                        </span>
                        <Icon size={15} className={`mt-0.5 shrink-0 ${on ? 'text-brand-400' : 'text-white/40'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-bold text-white">{f.label}</span>
                          <span className="block text-[11px] leading-snug text-white/45">{f.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Nav */}
        <div className="relative mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] text-white/45 transition-colors hover:text-white disabled:opacity-0 cursor-pointer"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button
            onClick={skip}
            className="rounded-full px-3 py-2 text-[12px] text-white/35 transition-colors hover:text-white/70 cursor-pointer"
          >
            Skip for now
          </button>
          <button
            onClick={next}
            className="flex items-center gap-2 rounded-full bg-brand-500 px-6 py-2.5 text-[12.5px] font-bold uppercase tracking-wider text-black transition-all hover:bg-brand-400 cursor-pointer"
          >
            {step === STEPS.length - 1 ? (
              <>
                <Sparkles size={14} /> Finish
              </>
            ) : (
              <>
                Next <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
