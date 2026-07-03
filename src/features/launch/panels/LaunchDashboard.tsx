import { Trash2 } from 'lucide-react';
import Panel from '../../../components/ui/Panel';
import Button from '../../../components/ui/Button';
import { useDialog } from '../../../context/DialogContext';
import type { LaunchState, ProspectStatus } from '../types';
import { SectionHeader, STATUS_META } from './shared';

const FUNNEL: ProspectStatus[] = ['new', 'messaged', 'loom_sent', 'replied', 'call_booked'];

export default function LaunchDashboard({
  state,
  update,
  goToOffer,
  goToProspects,
}: {
  state: LaunchState;
  update: (fn: (prev: LaunchState) => LaunchState) => void;
  goToOffer: () => void;
  goToProspects: () => void;
}) {
  const { confirm } = useDialog();
  const { activeOffer, prospects } = state;

  const funnel = FUNNEL.reduce<Record<string, number>>((acc, s) => {
    acc[s] = prospects.filter((p) => p.status === s).length;
    return acc;
  }, {});
  const planPct = Math.round((state.planDone.length / (30 * 3)) * 100);

  const setStatus = (id: string, status: ProspectStatus) =>
    update((prev) => ({ ...prev, prospects: prev.prospects.map((p) => (p.id === id ? { ...p, status } : p)) }));

  const remove = async (id: string, name: string) => {
    if (await confirm({ title: 'Remove prospect?', message: `Remove “${name}” from your pipeline?`, confirmLabel: 'Remove', danger: true })) {
      update((prev) => ({ ...prev, prospects: prev.prospects.filter((p) => p.id !== id) }));
    }
  };

  return (
    <div className="max-w-5xl space-y-8">
      <SectionHeader
        kicker="Command center"
        title="Launch Dashboard"
        subtitle="Your offer, your pipeline, and the funnel — the only numbers that matter until the first client pays."
      />

      <Panel accent>
        {activeOffer ? (
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">Active offer</p>
              <h3 className="mt-1 text-2xl font-extrabold text-white">{activeOffer.title}</h3>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/50">{activeOffer.whatYouSell}</p>
              <p className="mt-2 text-[13px] text-white/70"><span className="font-semibold text-white">Selling to:</span> {activeOffer.whoYouSellTo}</p>
            </div>
            <div className="flex shrink-0 gap-3">
              {activeOffer.pricingTiers.map((t) => (
                <div key={t.name} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
                  <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/40">{t.name}</p>
                  <p className="text-lg font-extrabold text-white">${(t.price / 1000).toFixed(t.price % 1000 ? 1 : 0)}K</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] text-white/50">No active offer yet.</p>
            <Button onClick={goToOffer}>Generate one</Button>
          </div>
        )}
      </Panel>

      <div>
        <p className="mb-3 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Funnel</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {FUNNEL.map((s, i) => (
            <Panel key={s} accent={s === 'call_booked'}>
              <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">{i + 1}. {STATUS_META[s].label}</p>
              <p className={`mt-1 text-3xl font-extrabold ${s === 'call_booked' ? 'text-brand-400' : 'text-white'}`}>{funnel[s] ?? 0}</p>
            </Panel>
          ))}
        </div>
        <p className="mt-2 text-[11px] italic text-white/35">
          {prospects.length === 0
            ? 'Empty pipeline — build your list to start filling it.'
            : `${prospects.length} prospect${prospects.length === 1 ? '' : 's'} · goal: move every row one column right each week.`}
        </p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">30-day plan</p>
            <p className="mt-1 text-[13px] text-white/50">{state.planDone.length} of {30 * 3} daily tasks checked off.</p>
          </div>
          <p className="text-2xl font-extrabold text-white">{planPct}%</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${planPct}%` }} />
        </div>
      </Panel>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Pipeline</p>
          <button className="text-[13px] font-semibold text-brand-400 hover:text-brand-300 transition-colors cursor-pointer" onClick={goToProspects}>+ Add prospects</button>
        </div>
        {prospects.length === 0 ? (
          <Panel><p className="text-[13px] text-white/50">Nothing here yet. Generate a targeted list to fill your pipeline.</p></Panel>
        ) : (
          <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-white/10 bg-white/[0.02]">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/40">
                  <th className="px-4 py-3 font-bold">Prospect</th>
                  <th className="px-4 py-3 font-bold">Buying signal</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id} className="border-b border-white/6 last:border-0">
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="text-[11px] text-white/40">{p.role} · {p.companyType}</p>
                    </td>
                    <td className="max-w-md px-4 py-3 align-top text-white/50">{p.signal}</td>
                    <td className="px-4 py-3 align-top">
                      <select
                        className="rounded-lg border border-white/12 bg-[#05070c] px-2 py-1.5 text-[11px] font-semibold text-white outline-none focus:border-brand-500/60"
                        value={p.status}
                        onChange={(e) => setStatus(p.id, e.target.value as ProspectStatus)}
                      >
                        {FUNNEL.map((s) => <option key={s} value={s} className="bg-[#0a0c12]">{STATUS_META[s].label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button onClick={() => remove(p.id, p.name)} aria-label={`Remove ${p.name}`} className="text-white/25 hover:text-red-400 transition-colors cursor-pointer">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
