import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechCue } from '../voice/useVoice';

/** Fallback pace when nothing is being spoken: ~140 steps of 18ms. */
const TICK_MS = 18;
const FREE_STEPS = 140;

/**
 * How long to hold a reply back waiting for audio that may never play.
 *
 * The TTS round trip is normally a second or two; past this the text should
 * appear regardless, because a silent bug must not cost the user the answer.
 */
const MAX_WAIT_MS = 5000;

export interface TypewriterSync {
  /** True while audio is being fetched — hold the text until it starts. */
  pending: boolean;
  /** Set once audio is actually playing. */
  cue: SpeechCue | null;
}

/**
 * Progressively reveals `text` for a streaming feel. `animate=false` shows it
 * instantly (used for history). `skip()` completes it immediately (interrupt).
 *
 * When `sync` is supplied, the reveal follows the voice rather than running on
 * its own clock: it waits for audio to start, then spreads the text across the
 * clip's real duration so the words land roughly as they are spoken. Without a
 * duration (browser TTS) it at least starts together, which is the mismatch
 * that actually reads as broken.
 */
export function useTypewriter(text: string, animate: boolean, sync?: TypewriterSync) {
  const [shown, setShown] = useState(animate ? '' : text);
  const [done, setDone] = useState(!animate);
  const timerRef = useRef<number | null>(null);

  const waiting = !!sync?.pending;
  const cueId = sync?.cue?.id ?? null;
  const cueDuration = sync?.cue?.duration ?? null;

  useEffect(() => {
    if (!animate) {
      setShown(text);
      setDone(true);
      return;
    }

    // Audio is loading: show nothing yet, but never hold longer than MAX_WAIT_MS.
    if (waiting) {
      setShown('');
      setDone(false);
      const release = window.setTimeout(() => setDone(false), MAX_WAIT_MS);
      return () => window.clearTimeout(release);
    }

    setShown('');
    setDone(false);
    if (text.length === 0) {
      setDone(true);
      return;
    }

    // Spread across the clip when we know how long it is; otherwise free pace.
    const steps = cueDuration && cueDuration > 0 ? Math.max(1, Math.round((cueDuration * 1000) / TICK_MS)) : FREE_STEPS;
    const chunk = Math.max(1, Math.ceil(text.length / steps));

    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(text.length, i + chunk);
      setShown(text.slice(0, i));
      if (i >= text.length) {
        setDone(true);
        window.clearInterval(id);
      }
    }, TICK_MS);
    timerRef.current = id as unknown as number;
    return () => window.clearInterval(id);
  }, [text, animate, waiting, cueId, cueDuration]);

  const skip = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setShown(text);
    setDone(true);
  }, [text]);

  return { shown, done, skip };
}
