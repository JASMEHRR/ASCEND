import { useCallback, useEffect, useState } from 'react';
import { Landmark, RefreshCw, AlertTriangle, Link2, TrendingUp, TrendingDown } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import { money } from '../stocks/quotesClient';
import { useKite } from './KiteContext';
import { kiteFetch, KiteExpiredError, type KiteHolding } from './kiteClient';

const inr = (n: number) => money(n, 'INR');

/**
 * Real brokerage holdings from Zerodha (read-only), shown at the top of the
 * Stocks & Finance hub — distinct from the manual holdings tracker below it.
 */
export default function KitePanel() {
  const { status, connected, token, connect, markExpired } = useKite();
  const [holdings, setHoldings] = useState<KiteHolding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      setHoldings(await kiteFetch<KiteHolding[]>('holdings', token));
      setError(null);
    } catch (e) {
      if (e instanceof KiteExpiredError) markExpired();
      else setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [token, markExpired]);

  useEffect(() => {
    if (connected) refresh();
    else setHoldings(null);
  }, [connected, refresh]);

  if (status === 'disconnected') {
    return (
      <Panel>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
          <Landmark size={12} /> Zerodha portfolio
        </p>
        <p className="mt-2 text-[13px] text-white/35">Connect Zerodha in Settings to see your real holdings here — read-only.</p>
      </Panel>
    );
  }

  if (status === 'expired') {
    return (
      <Panel>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
          <Landmark size={12} /> Zerodha portfolio
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[12px] text-amber-300/90">
            <AlertTriangle size={14} className="shrink-0" />
            Session expired — Kite tokens reset daily around 7:30am IST.
          </span>
          <button
            onClick={connect}
            className="flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/15 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-300 hover:bg-brand-500/25 transition-colors cursor-pointer"
          >
            <Link2 size={12} /> Reconnect Kite
          </button>
        </div>
      </Panel>
    );
  }

  const invested = (holdings ?? []).reduce((s, h) => s + h.average_price * h.quantity, 0);
  const current = (holdings ?? []).reduce((s, h) => s + h.last_price * h.quantity, 0);
  const dayPnl = (holdings ?? []).reduce((s, h) => s + (h.day_change ?? 0) * h.quantity, 0);
  const totalPnl = current - invested;

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
          <Landmark size={12} /> Zerodha portfolio
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <p className="mb-2 flex items-center gap-2 text-[12px] text-amber-300/90">
          <AlertTriangle size={13} className="shrink-0" /> {error}
        </p>
      )}

      {holdings === null ? (
        <p className="text-[13px] text-white/35">Loading holdings…</p>
      ) : holdings.length === 0 ? (
        <p className="text-[13px] text-white/35">No holdings in this Zerodha account.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
            <span className="text-white/50">
              Value <span className="font-extrabold text-white">{inr(current)}</span>
            </span>
            <span className={`flex items-center gap-1 font-semibold ${totalPnl >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {inr(totalPnl)} overall
            </span>
            <span className={`font-semibold ${dayPnl >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
              {dayPnl >= 0 ? '+' : ''}
              {inr(dayPnl)} today
            </span>
          </div>
          <ul className="divide-y divide-white/5">
            {holdings.map((h) => (
              <li key={`${h.exchange}:${h.tradingsymbol}`} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="w-28 shrink-0 font-mono font-bold text-white/85">{h.tradingsymbol}</span>
                <span className="w-16 shrink-0 text-right text-white/50">{h.quantity} ×</span>
                <span className="hidden sm:block w-24 shrink-0 text-right text-white/40">{inr(h.average_price)}</span>
                <span className="w-24 shrink-0 text-right font-semibold text-white/85">{inr(h.last_price)}</span>
                <span className={`flex-1 text-right text-[12px] font-semibold ${h.pnl >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                  {h.pnl >= 0 ? '+' : ''}
                  {inr(h.pnl)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
