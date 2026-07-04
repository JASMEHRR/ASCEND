import { useState } from 'react';
import { LayoutDashboard, Crosshair, Package, Users, Send, Lightbulb, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OSState } from '../../types';
import { useLaunchStateContext } from './LaunchStateContext';
import BusinessHub from '../../components/BusinessHub';
import LaunchDashboard from './panels/LaunchDashboard';
import OpportunityMatrix from './panels/OpportunityMatrix';
import OfferWizard from './panels/OfferWizard';
import ProspectBuilder from './panels/ProspectBuilder';
import OutreachStudio from './panels/OutreachStudio';

type Tab = 'command' | 'validate' | 'offer' | 'prospects' | 'outreach' | 'ideas';

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'command', label: 'Command', icon: <LayoutDashboard size={14} /> },
  { key: 'validate', label: 'Validate', icon: <Crosshair size={14} /> },
  { key: 'offer', label: 'Offer', icon: <Package size={14} /> },
  { key: 'prospects', label: 'Prospects', icon: <Users size={14} /> },
  { key: 'outreach', label: 'Outreach', icon: <Send size={14} /> },
  { key: 'ideas', label: 'Ideas', icon: <Lightbulb size={14} /> },
];

/**
 * Strategic Command hub: the LaunchKit "sell before you build" toolkit, merged
 * into ASCEND. Business data syncs per-user via useLaunchState; the existing
 * BusinessHub is preserved as the "Ideas" tab.
 */
export default function LaunchHub({
  state: osState,
  updateState,
}: {
  state: OSState;
  updateState: (fn: (prev: OSState) => OSState) => void;
}) {
  const { state, update } = useLaunchStateContext();
  const [tab, setTab] = useState<Tab>('command');

  const launchReady = state !== null;

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Sub-tab navigation */}
      <nav className="flex gap-1.5 overflow-x-auto custom-scrollbar rounded-2xl border border-white/10 bg-white/[0.03] p-1.5" aria-label="Strategic Command sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              tab === t.key ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.05]'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'ideas' ? (
        <BusinessHub state={osState} updateState={updateState} />
      ) : !launchReady ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/30" />
        </div>
      ) : (
        <>
          {tab === 'command' && (
            <LaunchDashboard state={state} update={update} goToOffer={() => setTab('offer')} goToProspects={() => setTab('prospects')} />
          )}
          {tab === 'validate' && <OpportunityMatrix state={state} update={update} />}
          {tab === 'offer' && <OfferWizard state={state} update={update} />}
          {tab === 'prospects' && <ProspectBuilder state={state} update={update} goToOffer={() => setTab('offer')} />}
          {tab === 'outreach' && <OutreachStudio state={state} update={update} goToProspects={() => setTab('prospects')} />}
        </>
      )}
    </div>
  );
}
