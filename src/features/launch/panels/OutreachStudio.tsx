import { useState } from 'react';
import Panel from '../../../components/ui/Panel';
import Button from '../../../components/ui/Button';
import CopyBlock from '../../../components/ui/CopyBlock';
import { launchApi } from '../launchApi';
import type { LaunchState, Sequence } from '../types';
import { SectionHeader, FrameworkNote, ErrorNote, Spinner, StatusPill } from './shared';

function SequenceView({ seq }: { seq: Sequence }) {
  return (
    <div className="space-y-3">
      <CopyBlock label="1 · Connection message" text={seq.connectionMessage} />
      <CopyBlock label="2 · Follow-up DM" text={seq.followUp} />
      <CopyBlock label="3 · Loom video script" text={seq.loomScript} />
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">4 · Reply handling</p>
        <div className="space-y-3">
          {seq.replyHandling.map((r, i) => (
            <div key={i} className="border-l-2 border-amber-500/50 pl-3 text-[13px]">
              <p className="italic text-white/45">If they say: “{r.ifTheySay}”</p>
              <p className="mt-1 text-white/80">{r.respondWith}</p>
            </div>
          ))}
        </div>
      </div>
      <CopyBlock label="5 · Call-booking ask" text={seq.callBookingAsk} />
    </div>
  );
}

const TASKS = [
  { key: 'posts', label: 'Post published', target: '5 posts/week' },
  { key: 'connections', label: '~40 connections', target: '200/week' },
  { key: 'dms', label: '16–18 DMs', target: '~16–18/day' },
] as const;

function PlanTracker({ state, update }: { state: LaunchState; update: (fn: (p: LaunchState) => LaunchState) => void }) {
  const done = new Set(state.planDone);
  const total = 30 * TASKS.length;
  const pct = Math.round((done.size / total) * 100);

  const toggle = (day: number, task: string) => {
    const key = `${day}:${task}`;
    update((prev) => {
      const set = new Set(prev.planDone);
      set.has(key) ? set.delete(key) : set.add(key);
      return { ...prev, planDone: [...set] };
    });
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">The 30-day plan</p>
          <p className="mt-1 text-[13px] text-white/50">5 posts/week · ~40 connections/workday · ~16–18 DMs/day. Consistency beats brilliance.</p>
        </div>
        <p className="text-2xl font-extrabold text-white">{pct}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-[13px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40">
              <th className="pr-2 font-bold">Day</th>
              {TASKS.map((t) => (
                <th key={t.key} className="px-2 font-bold">
                  {t.label}
                  <span className="block font-normal normal-case tracking-normal text-white/25">{t.target}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
              <tr key={day}>
                <td className="pr-2 font-semibold text-white/40">{day}</td>
                {TASKS.map((t) => (
                  <td key={t.key} className="px-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-500"
                      checked={done.has(`${day}:${t.key}`)}
                      onChange={() => toggle(day, t.key)}
                      aria-label={`Day ${day} ${t.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function OutreachStudio({
  state,
  update,
  goToProspects,
}: {
  state: LaunchState;
  update: (fn: (prev: LaunchState) => LaunchState) => void;
  goToProspects: () => void;
}) {
  const [prospectId, setProspectId] = useState<string | null>(state.prospects[0]?.id ?? null);
  const [variant, setVariant] = useState<'outbound' | 'inbound'>('outbound');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const current = state.prospects.find((p) => p.id === prospectId) ?? null;
  const pkg = prospectId ? state.outreach[prospectId] ?? null : null;

  async function generate() {
    if (!current || !state.activeOffer) return;
    setLoading(true);
    setError('');
    try {
      const result = await launchApi.writeOutreach(current, state.activeOffer);
      update((prev) => ({ ...prev, outreach: { ...prev.outreach, [current.id]: result } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <SectionHeader
        kicker="Step 04 — Start conversations"
        title="Outreach Studio"
        subtitle="Pick a prospect; the model writes the full sequence — connection → follow-up → Loom script → reply handling → call ask — in cold and warm variants."
      />

      <FrameworkNote title="The two plays">
        <strong className="text-white">Outbound (cold):</strong> agitate a pain they can see ("last upload was 3 months
        ago"), then offer a free audit. <strong className="text-white">Inbound/warm:</strong> compliment something
        specific, then ask a this-or-that qualifying question. Both funnels end at a 20-minute call.
      </FrameworkNote>

      {state.prospects.length === 0 ? (
        <Panel>
          <p className="text-[13px] text-white/50">
            No prospects in your pipeline yet.{' '}
            <button className="font-semibold text-brand-400 cursor-pointer" onClick={goToProspects}>Build your list first →</button>
          </p>
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-[13px]">
                <span className="mb-1 block text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Prospect</span>
                <select
                  className="w-full rounded-xl border border-white/12 bg-[#05070c] px-4 py-3 text-[13px] text-white outline-none focus:border-brand-500/60"
                  value={prospectId ?? ''}
                  onChange={(e) => setProspectId(e.target.value)}
                >
                  {state.prospects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#0a0c12]">{p.name} — {p.companyType}</option>
                  ))}
                </select>
              </label>
              <Button onClick={generate} loading={loading} disabled={!current || !state.activeOffer}>
                {loading ? 'Writing' : pkg ? 'Regenerate' : 'Write sequence'}
              </Button>
            </div>
            {current && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-white/50">
                <StatusPill status={current.status} />
                <span><strong className="text-white/70">Signal:</strong> {current.signal}</span>
              </p>
            )}
            {!state.activeOffer && <p className="mt-3 text-[12px] text-amber-300/80">Set an active offer to tailor the sequence.</p>}
            {loading && <div className="mt-4"><Spinner label="Writing both variants against this prospect's signal (30–60s)…" /></div>}
            {error && <div className="mt-4"><ErrorNote message={error} /></div>}
          </Panel>

          {pkg && (
            <div>
              <div className="mb-4 inline-flex rounded-full border border-white/12 bg-white/[0.03] p-1">
                {(['outbound', 'inbound'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVariant(v)}
                    className={`rounded-full px-5 py-2 text-[12px] font-semibold transition-colors cursor-pointer ${
                      variant === v ? 'bg-white text-black' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    {v === 'outbound' ? 'Outbound · cold' : 'Inbound · warm'}
                  </button>
                ))}
              </div>
              <SequenceView seq={pkg[variant]} />
            </div>
          )}
        </>
      )}

      <PlanTracker state={state} update={update} />
    </div>
  );
}
