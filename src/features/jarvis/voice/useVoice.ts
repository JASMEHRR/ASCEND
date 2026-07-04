import { useCallback, useEffect, useRef, useState } from 'react';

// Vendor-prefixed Web Speech API — typed loosely; it isn't in lib.dom yet.
const SpeechRecognitionImpl: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

const synthAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

interface UseVoiceOptions {
  /** Called with the final transcript when a listening session ends. */
  onResult: (transcript: string) => void;
}

/**
 * Push-to-talk speech input (SpeechRecognition) + spoken output
 * (speechSynthesis, preferring a British male voice for the JARVIS vibe).
 * Fails gracefully where unsupported — text always works.
 */
export function useVoice({ onResult }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [muted, setMuted] = useState(false);

  const recogRef = useRef<any>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const inputSupported = !!SpeechRecognitionImpl;

  const speak = useCallback((text: string) => {
    if (mutedRef.current || !synthAvailable || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, ''));
    u.rate = 1.05;
    u.pitch = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /en[-_]GB/i.test(v.lang) && /male|daniel|george|arthur/i.test(v.name)) ||
      voices.find((v) => /en[-_]GB/i.test(v.lang)) ||
      voices.find((v) => /en/i.test(v.lang));
    if (preferred) u.voice = preferred;
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
      return !m;
    });
  }, [stopSpeaking]);

  useEffect(() => stopSpeaking, [stopSpeaking]);

  return { listening, speaking, interim, muted, inputSupported, start, stop, speak, stopSpeaking, toggleMuted };
}
