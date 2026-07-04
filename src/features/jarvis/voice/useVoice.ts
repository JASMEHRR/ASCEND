import { useCallback, useEffect, useRef, useState } from 'react';

// Vendor-prefixed Web Speech API — typed loosely; it isn't in lib.dom yet.
const SpeechRecognitionImpl: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

const synthAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Persisted so Jarvis sounds the same on every reload and every session. */
const VOICE_STORAGE_KEY = 'ascend_jarvis_voice_uri';
const MUTE_STORAGE_KEY = 'ascend_jarvis_muted';

/**
 * Deterministic ranking for the default JARVIS voice: natural-sounding British
 * male first, then any en-GB, then any English. Higher score wins; ties break
 * by name so the same browser always yields the same voice.
 */
function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.replace('_', '-').toLowerCase();
  let s = 0;
  if (lang.startsWith('en-gb')) s += 400;
  else if (lang.startsWith('en')) s += 200;
  // Known male en-GB names across Windows/macOS/Chrome/Edge voice packs.
  if (/(ryan|daniel|george|arthur|oliver|thomas|brian|alfie|noah|\bmale\b)/.test(name)) s += 100;
  if (/(female|sonia|libby|hazel|susan|amy|emma|kate|serena|martha|zira|maisie)/.test(name)) s -= 80;
  // Edge "Natural"/online neural voices and Google voices sound far better than
  // the legacy local SAPI ones.
  if (/(natural|neural|online)/.test(name)) s += 60;
  if (/google/.test(name)) s += 40;
  return s;
}

function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name))[0];
}

interface UseVoiceOptions {
  /** Called with the final transcript when a listening session ends. */
  onResult: (transcript: string) => void;
}

/**
 * Push-to-talk speech input (SpeechRecognition, en-IN for local accent accuracy)
 * + spoken output (speechSynthesis) with ONE pinned, persisted voice — chosen
 * deterministically at init (British male JARVIS default) instead of drifting
 * with whatever the browser feels like per utterance. Fails gracefully where
 * unsupported — text always works.
 */
export function useVoice({ onResult }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VOICE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const recogRef = useRef<any>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const inputSupported = !!SpeechRecognitionImpl;

  // Voices load asynchronously (often empty on first call) — resolve the pinned
  // voice once they arrive, and pin+persist a default if nothing is stored yet.
  useEffect(() => {
    if (!synthAvailable) return;
    const resolve = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length) return;
      setVoices(list);
      let uri: string | null = null;
      try {
        uri = localStorage.getItem(VOICE_STORAGE_KEY);
      } catch {
        /* private mode */
      }
      let chosen = uri ? list.find((v) => v.voiceURI === uri) ?? null : null;
      if (!chosen) {
        chosen = pickDefaultVoice(list);
        if (chosen) {
          try {
            localStorage.setItem(VOICE_STORAGE_KEY, chosen.voiceURI);
          } catch {
            /* private mode */
          }
          setVoiceURIState(chosen.voiceURI);
        }
      }
      voiceRef.current = chosen;
    };
    resolve();
    window.speechSynthesis.addEventListener('voiceschanged', resolve);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', resolve);
  }, []);

  /** Settings picker: pin a specific voice and persist it. */
  const setVoiceURI = useCallback((uri: string) => {
    const list = synthAvailable ? window.speechSynthesis.getVoices() : [];
    const v = list.find((x) => x.voiceURI === uri) ?? null;
    if (!v) return;
    voiceRef.current = v;
    setVoiceURIState(uri);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, uri);
    } catch {
      /* private mode */
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (mutedRef.current || !synthAvailable || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>|]/g, ''));
    u.rate = 1.05;
    u.pitch = 0.9;
    // Always the pinned voice; if voices haven't loaded yet, re-resolve now.
    if (!voiceRef.current) {
      const list = window.speechSynthesis.getVoices();
      const uri = (() => {
        try {
          return localStorage.getItem(VOICE_STORAGE_KEY);
        } catch {
          return null;
        }
      })();
      voiceRef.current = (uri && list.find((v) => v.voiceURI === uri)) || pickDefaultVoice(list);
    }
    if (voiceRef.current) u.voice = voiceRef.current;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (synthAvailable) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => recogRef.current?.stop(), []);

  const start = useCallback(() => {
    if (!SpeechRecognitionImpl || listening) return;
    stopSpeaking();
    const recog = new SpeechRecognitionImpl();
    recogRef.current = recog;
    recog.lang = 'en-IN';
    recog.interimResults = true;
    recog.continuous = false;

    let finalText = '';
    recog.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText || finalText);
    };
    recog.onend = () => {
      setListening(false);
      setInterim('');
      if (finalText.trim()) onResultRef.current(finalText.trim());
    };
    recog.onerror = () => {
      setListening(false);
      setInterim('');
    };
    setListening(true);
    recog.start();
  }, [listening, stopSpeaking]);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      if (!m) stopSpeaking();
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, m ? '0' : '1');
      } catch {
        /* private mode */
      }
      return !m;
    });
  }, [stopSpeaking]);

  useEffect(() => stopSpeaking, [stopSpeaking]);

  return {
    listening,
    speaking,
    interim,
    muted,
    inputSupported,
    voices,
    voiceURI,
    setVoiceURI,
    start,
    stop,
    speak,
    stopSpeaking,
    toggleMuted,
  };
}
