import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Progressively reveals `text` for a streaming feel. `animate=false` shows it
 * instantly (used for history). `skip()` completes it immediately (interrupt).
 */
export function useTypewriter(text: string, animate: boolean) {
  const [shown, setShown] = useState(animate ? '' : text);
  const [done, setDone] = useState(!animate);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) {
      setShown(text);
      setDone(true);
      return;
    }
    setShown('');
    setDone(false);
    let i = 0;
    const chunk = Math.max(2, Math.ceil(text.length / 140));
    const id = window.setInterval(() => {
      i = Math.min(text.length, i + chunk);
      setShown(text.slice(0, i));
      if (i >= text.length) {
        setDone(true);
        window.clearInterval(id);
      }
    }, 18);
    rafRef.current = id as unknown as number;
    return () => window.clearInterval(id);
  }, [text, animate]);

  const skip = useCallback(() => {
    if (rafRef.current) window.clearInterval(rafRef.current);
    setShown(text);
    setDone(true);
  }, [text]);

  return { shown, done, skip };
}
