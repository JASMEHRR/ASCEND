import { useState } from 'react';
import Panel from '../../../components/ui/Panel';
import Button from '../../../components/ui/Button';
import { launchApi } from '../launchApi';
import type { LaunchState, ProspectList, SavedProspect } from '../types';
import { SectionHeader, FrameworkNote, Disclaimer, ErrorNote, Spinner } from './shared';

export default function ProspectBuilder({
  state,
  update,
  goToOffer,
}: {
  state: LaunchState;
  update: (fn: (prev: LaunchState) => LaunchState) => void;
  goToOffer: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [list, setList] = useState<ProspectList | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(false);

  const offer = state.activeOffer;

  async function generate() {
    if (!offer) return;
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const result = await launchApi.buildProspects(offer);
      setList(result);
      setSelected(new Set(result.prospects.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  function saveSelected() {
    if (!list) return;
    const now = new Date().toISOString();
    const toSave: SavedProspect[] = list.prospects
      .filter((_, i) => selected.has(i))
      .map((p) => ({ ...p, id: crypto.randomUUID(), status: 'new', createdAt: now }));
    update((prev) => ({ ...prev, prospects: [...prev.prospects, ...toSave] }));
    setSaved(true);
  }

  function toggle(i: number) {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
    setSaved(false);
  }

  return (
    <div className="max-w-4xl">
      <SectionHeader
        kicker="Step 03 — Build the list"
        title="Targeted List Builder"
        subtitle="Produce ~10 prospect profiles that match your ideal customer — each with the buying signal that makes them likely to reply."
      />

      <div className="mb-6">
        <FrameworkNote title="Buying signals">
          The whole game is finding people who <strong className="text-white">visibly want the result</strong> but{' '}
          <strong className="text-white">visibly aren't good at it yet</strong>. A SaaS founder posting on LinkedIn 4×
          a week whose YouTube has 200 subs — wants content, can't produce video. That gap is why they reply.
        </FrameworkNote>
      </div>

      {!offer ? (
        <Panel>
          <p className="text-[13px] text-white/50">
            No active offer yet.{' '}
            <button className="font-semibold text-brand-400 cursor-pointer" onClick={goToOffer}>Generate one first →</button>
          </p>
        </Panel>
      ) : (
        <Panel className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Active offer</p>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-white">{offer.title}</p>
            </div>
            <Button onClick={generate} loading={loading} className="shrink-0">
              {loading ? 'Researching' : 'Generate prospect list'}
            </Button>
          </div>
          {loading && <div className="mt-4"><Spinner label="Finding where your buyers hang out right now — this can take a minute…" /></div>}
          {error && <div className="mt-4"><ErrorNote message={error} /></div>}
        </Panel>
      )}

      {list && (
        <div className="space-y-4">
          <Panel accent>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">Research notes</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/75">{list.researchNotes}</p>
          </Panel>

          {list.prospects.map((p, i) => (
            <Panel key={i} className={selected.has(i) ? '!border-brand-500/40' : 'opacity-55'}>
              <div className="flex items-start gap-4">
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="mt-1 h-4 w-4 accent-brand-500" aria-label={`Select ${p.name}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="text-[13px] text-white/50">{p.role} · {p.companyType}</p>
                  </div>
                  <div className="mt-2 grid gap-2 text-[13px] text-white/75 sm:grid-cols-2">
                    <p><span className="font-semibold text-brand-400">Signal:</span> {p.signal}</p>
                    <p><span className="font-semibold text-brand-300">Why they'll reply:</span> {p.whyLikely}</p>
                    <p><span className="font-semibold text-white/60">Opening angle:</span> {p.openingAngle}</p>
                    <p><span className="font-semibold text-white/60">Where to find them:</span> {p.whereToFind}</p>
                  </div>
                </div>
              </div>
            </Panel>
          ))}

          <Disclaimer>
            These are researched <em>archetypes</em>, not verified contacts. Find 2–3 real people matching each profile
            and confirm the signal holds before you reach out.
          </Disclaimer>

          <Button onClick={saveSelected} disabled={selected.size === 0 || saved}>
            {saved ? `Saved ${selected.size} to pipeline ✓` : `Save ${selected.size} to my pipeline`}
          </Button>
        </div>
      )}
    </div>
  );
}
