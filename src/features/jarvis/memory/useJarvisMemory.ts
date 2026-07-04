import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import type { ActionRecord } from '../types';

interface MemoryDoc {
  /** Durable facts the user asked Jarvis to remember (long-term memory). */
  facts: string[];
  /** The most recent actions Jarvis performed (session + short-term memory). */
  recentActions: ActionRecord[];
}

const EMPTY: MemoryDoc = { facts: [], recentActions: [] };
const MAX_ACTIONS = 12;
const MAX_FACTS = 50;

export interface JarvisMemory {
  facts: string[];
  recentActions: ActionRecord[];
  recordAction: (action: ActionRecord) => void;
  remember: (fact: string) => boolean;
  forget: (match: string) => boolean;
  /** Compact snapshot injected into Jarvis's context each turn. */
  snapshot: () => { facts: string[]; recentActions: { tool: string; summary: string; at: string }[] };
}

/**
 * Layered memory for Jarvis:
 *  - session/short-term: recentActions (what Jarvis just did),
 *  - long-term: facts the user explicitly asks it to remember.
 *
 * Persisted per-user to users/{uid}/jarvis/memory (offline-first localStorage
 * cache + debounced write + echo-guard) — the same architecture as the rest of
 * ASCEND's sync, so long-term memory can grow without new infrastructure.
 */
export function useJarvisMemory(uid: string | null): JarvisMemory {
  const [mem, setMem] = useState<MemoryDoc>(EMPTY);
  const lastSyncedRef = useRef('');
  const memRef = useRef<MemoryDoc>(mem);
  memRef.current = mem;

  useEffect(() => {
    const cacheKey = `ascend_jarvis_mem_${uid ?? 'guest'}`;
    let seed = EMPTY;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) seed = { ...EMPTY, ...JSON.parse(cached) };
    } catch {
      /* ignore */
    }
    setMem(seed);
    lastSyncedRef.current = '';
    if (!uid) return;

    const ref = doc(db, 'users', uid, 'jarvis', 'memory');
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const data = snap.data();
        if (!data) return;
        const merged: MemoryDoc = { facts: data.facts ?? [], recentActions: data.recentActions ?? [] };
        lastSyncedRef.current = JSON.stringify(merged);
        setMem(merged);
      },
      (err) => console.warn('[jarvis memory] listener error:', err.message),
    );
  }, [uid]);

  useEffect(() => {
    const cacheKey = `ascend_jarvis_mem_${uid ?? 'guest'}`;
    localStorage.setItem(cacheKey, JSON.stringify(mem));
    if (!uid) return;
    const payload = JSON.stringify(mem);
    if (payload === lastSyncedRef.current) return;
    const t = setTimeout(async () => {
      lastSyncedRef.current = payload;
      try {
        await setDoc(doc(db, 'users', uid, 'jarvis', 'memory'), mem);
      } catch (err) {
        console.warn('[jarvis memory] write failed:', (err as Error).message);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [mem, uid]);

  const recordAction = useCallback((action: ActionRecord) => {
    setMem((m) => ({ ...m, recentActions: [action, ...m.recentActions].slice(0, MAX_ACTIONS) }));
  }, []);

  const remember = useCallback((fact: string) => {
    const clean = fact.trim();
    if (!clean) return false;
    if (memRef.current.facts.some((f) => f.toLowerCase() === clean.toLowerCase())) return true;
    setMem((m) => ({ ...m, facts: [clean, ...m.facts].slice(0, MAX_FACTS) }));
    return true;
  }, []);

  const forget = useCallback((match: string) => {
    const needle = match.trim().toLowerCase();
    if (!needle) return false;
    let removed = false;
    setMem((m) => {
      const facts = m.facts.filter((f) => {
        const hit = f.toLowerCase().includes(needle);
        if (hit) removed = true;
        return !hit;
      });
      return { ...m, facts };
    });
    return removed;
  }, []);

  const snapshot = useCallback(
    () => ({
      facts: memRef.current.facts,
      recentActions: memRef.current.recentActions.map((a) => ({ tool: a.tool, summary: a.summary, at: a.at })),
    }),
    [],
  );

  return { facts: mem.facts, recentActions: mem.recentActions, recordAction, remember, forget, snapshot };
}
