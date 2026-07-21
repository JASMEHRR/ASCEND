import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** One proposed time block of a day plan. */
export interface PlanBlock {
  /** "HH:MM" 24h local time. */
  start: string;
  end: string;
  title: string;
  notes?: string;
}

export interface PendingPlan {
  blocks: PlanBlock[];
  rationale?: string;
  proposedAt: string;
}

/**
 * Holds the day plan Jarvis proposed and the user hasn't approved yet.
 * Jarvis PROPOSES (via the proposeDayPlan tool), the user APPROVES — nothing
 * touches the calendar until then.
 */
interface PlanningValue {
  pending: PendingPlan | null;
  propose: (blocks: PlanBlock[], rationale?: string) => void;
  clear: () => void;
}

const PlanningContext = createContext<PlanningValue | null>(null);

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPlan | null>(null);

  const propose = useCallback((blocks: PlanBlock[], rationale?: string) => {
    setPending({ blocks, rationale, proposedAt: new Date().toISOString() });
  }, []);

  const clear = useCallback(() => setPending(null), []);

  const value = useMemo(() => ({ pending, propose, clear }), [pending, propose, clear]);
  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
}

export function usePlanning(): PlanningValue {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error('usePlanning must be used within a <PlanningProvider>');
  return ctx;
}
