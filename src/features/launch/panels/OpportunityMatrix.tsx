import { useState } from 'react';
import { motion } from 'motion/react';
import Panel from '../../../components/ui/Panel';
import Button from '../../../components/ui/Button';
import { launchApi } from '../launchApi';
import type { LaunchState, MatrixResult, Quadrant } from '../types';
import { SectionHeader, FrameworkNote, ErrorNote, Spinner, inputCls } from './shared';

const QUADRANT_META: Record<Quadrant, { label: string; color: string; verdict: string }> = {
  blue_ocean: { label: 'Blue Ocean', color: 'text-brand-400', verdict: 'The target. High demand, few sellers — go.' },
  red_ocean: { label: 'Red Ocean', color: 'text-red-400', verdict: 'Real money, brutal fight. Reposition to escape.' },
  dead_zone: { label: 'Dead Zone', color: 'text-white/50', verdict: "Crowded and nobody's buying. Walk away." },
  too_niche: { label: 'Too Niche', color: 'text-amber-400', verdict: 'Easy to enter, no market to feed you.' },
};

function Grid({ result }: { result: MatrixResult | null }) {
  const x = result ? Math.min(Math.max(result.competition, 0), 100) : null;
  const y = result ? Math.min(Math.max(result.demand, 0), 100) : null;
  const cell = 'flex items-start p-3';
  return (
    <div className="relative">
      <div className="grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl border border-white/12">
        <div className={`${cell} bg-brand-500/[0.08]`}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">Blue Ocean 🎯</span>
        </div>
        <div className={`${cell} bg-red-500/[0.06]`}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">Red Ocean</span>
        </div>
        <div className={`${cell} items-end bg-amber-500/[0.05]`}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">Too Niche</span>
        </div>
        <div className={`${cell} items-end bg-white/[0.02]`}>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Dead Zone</span>
        </div>
      </div>
      {x !== null && y !== null && (
        <motion.div
          className="absolute z-10 -translate-x-1/2 translate-y-1/2"
          initial={{ left: '50%', bottom: '50%', opacity: 0 }}
          animate={{ left: `${x}%`, bottom: `${y}%`, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        >
          <span className="block h-5 w-5 rounded-full border-[3px] border-[#02040a] bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
        </motion.div>
      )}
      <p className="mt-2 flex justify-between text-[11px] text-white/30">
        <span>← Low competition</span>
        <span>High competition →</span>
      </p>
    </div>
  );
}

export default function OpportunityMatrix({
  state,
  update,
}: {
  state: LaunchState;
  update: (fn: (prev: LaunchState) => LaunchState) => void;
}) {
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MatrixResult | null>(null);

  async function score() {
    if (!idea.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await launchApi.scoreIdea(idea.trim());
      setResult(res);
      update((prev) => ({
        ...prev,
        matrixHistory: [
          { ...res, id: crypto.randomUUID(), idea: idea.trim(), createdAt: new Date().toISOString() },
          ...prev.matrixHistory,
        ].slice(0, 25),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scoring failed');
    } finally {
      setLoading(false);
    }
  }

  const meta = result ? QUADRANT_META[result.quadrant] : null;

  return (
    <div className="max-w-4xl">
      <SectionHeader
        kicker="Step 01 — Validate the idea"
        title="Opportunity Matrix"
        subtitle="Before selling anything, place the idea on the demand × competition grid. You're hunting one quadrant: Blue Ocean."
      />

      <div className="mb-6">
        <FrameworkNote title="The framework">
          Every idea lives on two axes: <strong className="text-white">demand</strong> (do people urgently want this?)
          and <strong className="text-white">competition</strong> (how many already sell it?). High demand + low
          competition = <strong className="text-white">Blue Ocean</strong> — the only quadrant worth entering solo.
          Most "obvious" AI ideas are Red Ocean; the fix is usually narrowing <em>who</em> you serve.
        </FrameworkNote>
      </div>

      <Panel className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className={inputCls}
            placeholder='e.g. "AI LinkedIn ghostwriting for fintech founders"'
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && score()}
          />
          <Button onClick={score} loading={loading} disabled={!idea.trim()} className="shrink-0">
            {loading ? 'Scoring' : 'Score idea'}
          </Button>
        </div>
        {loading && <div className="mt-4"><Spinner label="Sizing the market and the competition…" /></div>}
        {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Grid result={result} />
        <div className="space-y-4">
          {!result && !loading && (
            <p className="text-[13px] italic text-white/40">
              Enter an idea to see where it lands. The dot's position is the model's demand/competition score.
            </p>
          )}
          {result && meta && (
            <>
              <Panel>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Verdict</p>
                <p className={`mt-1 text-2xl font-extrabold ${meta.color}`}>{meta.label}</p>
                <p className="mt-1 text-[13px] text-white/50">{meta.verdict}</p>
                <div className="mt-4 flex gap-6 text-[13px] text-white/70">
                  <span>Demand <strong className="text-lg text-white">{result.demand}</strong>/100</span>
                  <span>Competition <strong className="text-lg text-white">{result.competition}</strong>/100</span>
                </div>
              </Panel>
              <Panel>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Why</p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/75">{result.explanation}</p>
              </Panel>
              <Panel>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Recommendation</p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/75">{result.recommendation}</p>
                <p className="mt-3 border-t border-white/8 pt-3 text-[13px] leading-relaxed text-white/75">
                  <strong className="text-brand-400">{result.quadrant === 'blue_ocean' ? 'Defend it: ' : 'Pivot idea: '}</strong>
                  {result.pivotSuggestion}
                </p>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
