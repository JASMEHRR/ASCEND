import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Plus,
  Trash2,
  RefreshCw,
  Bell,
  Wallet,
  PiggyBank,
  Landmark,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import type { OSState, FinanceState } from '../../types';
import { EMPTY_FINANCE } from '../../types';
import Panel from '../../components/ui/Panel';
import { useDialog } from '../../context/DialogContext';
import { fetchQuotes, money, type Quote } from './quotesClient';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

const fin = (s: OSState): FinanceState => s.finance ?? EMPTY_FINANCE;

/** All finance mutations funnel through here so `finance` always exists. */
function updateFinance(updateState: Props['updateState'], fn: (f: FinanceState) => FinanceState) {
  updateState((p) => ({ ...p, finance: fn(p.finance ?? EMPTY_FINANCE) }));
}

const monthKey = (iso: string) => iso.slice(0, 7);

/**
 * Stocks & Finance hub: live portfolio + watchlist (Yahoo proxy — Indian .NS/.BO
 * and international tickers), manual budgeting, and net-worth tracking. Quotes
 * refresh every 60s; when the unofficial upstream breaks, the page degrades to
 * manual values with a visible notice instead of erroring out.
 */
export default function StocksHub({ state, updateState }: Props) {
  const { prompt } = useDialog();
  const f = fin(state);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const symbolsKey = useMemo(
    () => [...new Set([...f.holdings.map((h) => h.symbol), ...f.watchlist.map((w) => w.symbol)])].sort().join(','),
    [f.holdings, f.watchlist],
  );
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const symbols = symbolsKey ? symbolsKey.split(',') : [];
    if (symbols.length === 0) {
      setQuotes(new Map());
      setQuoteError(null);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRefreshing(true);
    try {
      const { quotes: qs } = await fetchQuotes(symbols, ctrl.signal);
      setQuotes(new Map(qs.map((q) => [q.symbol.toUpperCase(), q])));
      setQuoteError(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setQuoteError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [symbolsKey]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => {
      clearInterval(t);
      abortRef.current?.abort();
    };
  }, [refresh]);

  // ---- Derived numbers -----------------------------------------------------
  const holdingsValued = f.holdings.map((h) => {
    const q = quotes.get(h.symbol.toUpperCase());
    return { ...h, quote: q ?? null, value: q ? q.price * h.qty : null, cost: h.avgCost * h.qty };
  });
  const portfolioValue = holdingsValued.reduce((sum, h) => sum + (h.value ?? h.cost), 0);
  const portfolioCost = holdingsValued.reduce((sum, h) => sum + h.cost, 0);
  const portfolioCurrency = holdingsValued.find((h) => h.quote?.currency)?.quote?.currency ?? 'INR';

  const thisMonth = monthKey(new Date().toISOString());
  const monthExpenses = f.expenses.filter((e) => monthKey(e.at) === thisMonth);
  const spent = monthExpenses.reduce((s, e) => s + e.amount, 0);

  const assets = f.netWorthItems.filter((n) => n.type === 'asset').reduce((s, n) => s + n.amount, 0);
  const liabilities = f.netWorthItems.filter((n) => n.type === 'liability').reduce((s, n) => s + n.amount, 0);
  const netWorth = assets - liabilities + portfolioValue;

  const triggeredAlerts = f.watchlist.filter((w) => {
    const q = quotes.get(w.symbol.toUpperCase());
    if (!q) return false;
    return (w.alertAbove !== undefined && q.price >= w.alertAbove) || (w.alertBelow !== undefined && q.price <= w.alertBelow);
  });

  // ---- Add flows (dialog-driven, no forms cluttering the page) --------------
  const addHolding = async () => {
    const symbol = (await prompt({ title: 'Add holding', message: 'Yahoo symbol — e.g. RELIANCE.NS, TCS.BO, AAPL', placeholder: 'RELIANCE.NS' }))?.trim().toUpperCase();
    if (!symbol) return;
    const qty = Number(await prompt({ title: 'Quantity', message: `Units of ${symbol} you hold.`, placeholder: 'e.g. 10' }));
    if (!Number.isFinite(qty) || qty <= 0) return;
    const avgCost = Number(await prompt({ title: 'Average cost', message: `Average buy price per unit of ${symbol}.`, placeholder: 'e.g. 2450' }));
    if (!Number.isFinite(avgCost) || avgCost < 0) return;
    updateFinance(updateState, (fs) => ({ ...fs, holdings: [...fs.holdings, { id: crypto.randomUUID(), symbol, qty, avgCost }] }));
  };

  const addWatch = async () => {
    const symbol = (await prompt({ title: 'Watch a symbol', message: 'Yahoo symbol — e.g. INFY.NS, NVDA', placeholder: 'INFY.NS' }))?.trim().toUpperCase();
    if (!symbol) return;
    updateFinance(updateState, (fs) => ({ ...fs, watchlist: [...fs.watchlist, { id: crypto.randomUUID(), symbol }] }));
  };

  const setAlert = async (id: string, dir: 'above' | 'below') => {
    const item = f.watchlist.find((w) => w.id === id);
    if (!item) return;
    const v = await prompt({ title: `Alert when ${item.symbol} goes ${dir}`, message: 'Price threshold (blank to clear).', placeholder: 'e.g. 3000' });
    if (v === null) return;
    const n = v.trim() === '' ? undefined : Number(v);
    if (n !== undefined && !Number.isFinite(n)) return;
    updateFinance(updateState, (fs) => ({
      ...fs,
      watchlist: fs.watchlist.map((w) => (w.id === id ? { ...w, [dir === 'above' ? 'alertAbove' : 'alertBelow']: n } : w)),
    }));
  };

  const logExpense = async () => {
    const label = (await prompt({ title: 'Log expense', message: 'What was it?', placeholder: 'e.g. Groceries' }))?.trim();
    if (!label) return;
    const amount = Number(await prompt({ title: 'Amount', message: `How much was "${label}"?`, placeholder: 'e.g. 1250' }));
    if (!Number.isFinite(amount) || amount <= 0) return;
    updateFinance(updateState, (fs) => ({ ...fs, expenses: [...fs.expenses, { id: crypto.randomUUID(), label, amount, at: new Date().toISOString() }] }));
  };

  const setBudget = async () => {
    const v = await prompt({ title: 'Monthly budget', message: 'Spending cap for each calendar month (blank to clear).', placeholder: 'e.g. 30000' });
    if (v === null) return;
    const n = v.trim() === '' ? undefined : Number(v);
    if (n !== undefined && (!Number.isFinite(n) || n <= 0)) return;
    updateFinance(updateState, (fs) => ({ ...fs, monthlyBudget: n }));
  };

  const addNetWorthItem = async (type: 'asset' | 'liability') => {
    const label = (await prompt({ title: `Add ${type}`, message: type === 'asset' ? 'e.g. Savings account, FD, Gold' : 'e.g. Education loan, Credit card', placeholder: 'Label' }))?.trim();
    if (!label) return;
    const amount = Number(await prompt({ title: 'Amount', message: `Current value of "${label}".`, placeholder: 'e.g. 150000' }));
    if (!Number.isFinite(amount) || amount < 0) return;
    updateFinance(updateState, (fs) => ({ ...fs, netWorthItems: [...fs.netWorthItems, { id: crypto.randomUUID(), label, amount, type }] }));
  };

  const inr = (n: number) => money(n, portfolioCurrency);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <LineChart size={18} className="text-brand-400" /> Stocks & Finance
        </h2>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/50 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Quotes
        </button>
      </div>

      {quoteError && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-300/90">
          <AlertTriangle size={14} className="shrink-0" />
          Live quotes unavailable: {quoteError} — showing manual values.
        </div>
      )}
      {triggeredAlerts.length > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-brand-400/30 bg-brand-500/10 px-4 py-2.5 text-[12px] text-brand-300">
          <Bell size={14} className="shrink-0" />
          Alert: {triggeredAlerts.map((w) => w.symbol).join(', ')} crossed your threshold{triggeredAlerts.length > 1 ? 's' : ''}.
        </div>
      )}

      {/* Overview strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel>
          <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40"><Wallet size={12} /> Portfolio</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{inr(portfolioValue)}</p>
          {portfolioCost > 0 && (
            <p className={`mt-0.5 flex items-center gap-1 text-[12px] font-semibold ${portfolioValue >= portfolioCost ? 'text-brand-400' : 'text-red-400'}`}>
              {portfolioValue >= portfolioCost ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {(((portfolioValue - portfolioCost) / portfolioCost) * 100).toFixed(1)}% vs cost
            </p>
          )}
        </Panel>
        <Panel>
          <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40"><PiggyBank size={12} /> This month</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{inr(spent)}</p>
          <p className="mt-0.5 text-[12px] text-white/40">
            {f.monthlyBudget ? `${Math.round((spent / f.monthlyBudget) * 100)}% of ${inr(f.monthlyBudget)}` : 'no budget set'}
          </p>
        </Panel>
        <Panel>
          <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40"><Landmark size={12} /> Net worth</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{inr(netWorth)}</p>
          <p className="mt-0.5 text-[12px] text-white/40">incl. portfolio · {f.netWorthItems.length} item{f.netWorthItems.length === 1 ? '' : 's'}</p>
        </Panel>
      </div>

      {/* Portfolio */}
      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Holdings</p>
          <button onClick={addHolding} className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 cursor-pointer"><Plus size={12} /> Add</button>
        </div>
        {holdingsValued.length === 0 ? (
          <p className="text-[13px] text-white/35">No holdings yet. Add Indian (.NS/.BO) or international symbols.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {holdingsValued.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="w-28 shrink-0 font-mono font-bold text-white/85">{h.symbol}</span>
                <span className="hidden sm:block flex-1 truncate text-white/40">{h.quote?.name ?? ''}</span>
                <span className="w-20 shrink-0 text-right text-white/50">{h.qty} ×</span>
                <span className="w-28 shrink-0 text-right font-semibold text-white/85">{h.quote ? money(h.quote.price, h.quote.currency) : '—'}</span>
                <span className={`w-20 shrink-0 text-right text-[12px] font-semibold ${h.quote?.changePct == null ? 'text-white/30' : h.quote.changePct >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                  {h.quote?.changePct == null ? '' : `${h.quote.changePct >= 0 ? '+' : ''}${h.quote.changePct.toFixed(2)}%`}
                </span>
                <button onClick={() => updateFinance(updateState, (fs) => ({ ...fs, holdings: fs.holdings.filter((x) => x.id !== h.id) }))} aria-label={`Remove ${h.symbol}`} className="p-1.5 text-white/25 hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Watchlist */}
      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Watchlist & alerts</p>
          <button onClick={addWatch} className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 cursor-pointer"><Plus size={12} /> Watch</button>
        </div>
        {f.watchlist.length === 0 ? (
          <p className="text-[13px] text-white/35">Nothing watched yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {f.watchlist.map((w) => {
              const q = quotes.get(w.symbol.toUpperCase());
              const hit = triggeredAlerts.some((t) => t.id === w.id);
              return (
                <li key={w.id} className={`flex items-center gap-3 py-2 text-[13px] ${hit ? 'text-brand-300' : ''}`}>
                  <span className="w-28 shrink-0 font-mono font-bold text-white/85">{w.symbol}</span>
                  <span className="hidden sm:block flex-1 truncate text-white/40">{q?.name ?? ''}</span>
                  <span className="w-28 shrink-0 text-right font-semibold text-white/85">{q ? money(q.price, q.currency) : '—'}</span>
                  <span className={`w-20 shrink-0 text-right text-[12px] font-semibold ${q?.changePct == null ? 'text-white/30' : q.changePct >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                    {q?.changePct == null ? '' : `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`}
                  </span>
                  <button onClick={() => setAlert(w.id, 'above')} title={w.alertAbove !== undefined ? `Alert above ${w.alertAbove}` : 'Set alert above'} className={`p-1.5 transition-colors cursor-pointer ${w.alertAbove !== undefined ? 'text-brand-400' : 'text-white/25 hover:text-white/60'}`}><TrendingUp size={13} /></button>
                  <button onClick={() => setAlert(w.id, 'below')} title={w.alertBelow !== undefined ? `Alert below ${w.alertBelow}` : 'Set alert below'} className={`p-1.5 transition-colors cursor-pointer ${w.alertBelow !== undefined ? 'text-amber-400' : 'text-white/25 hover:text-white/60'}`}><TrendingDown size={13} /></button>
                  <button onClick={() => updateFinance(updateState, (fs) => ({ ...fs, watchlist: fs.watchlist.filter((x) => x.id !== w.id) }))} aria-label={`Unwatch ${w.symbol}`} className="p-1.5 text-white/25 hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={13} /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Budget */}
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Budget — {new Date().toLocaleString(undefined, { month: 'long' })}</p>
            <div className="flex gap-2">
              <button onClick={setBudget} className="text-[11px] font-semibold text-white/40 hover:text-white cursor-pointer">Set cap</button>
              <button onClick={logExpense} className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 cursor-pointer"><Plus size={12} /> Expense</button>
            </div>
          </div>
          {f.monthlyBudget && (
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full transition-all ${spent > f.monthlyBudget ? 'bg-red-400' : 'bg-brand-400'}`}
                style={{ width: `${Math.min(100, (spent / f.monthlyBudget) * 100)}%` }}
              />
            </div>
          )}
          {monthExpenses.length === 0 ? (
            <p className="text-[13px] text-white/35">No expenses logged this month.</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {[...monthExpenses].reverse().map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="flex-1 truncate text-white/70">{e.label}</span>
                  <span className="font-semibold text-white/85">{inr(e.amount)}</span>
                  <button onClick={() => updateFinance(updateState, (fs) => ({ ...fs, expenses: fs.expenses.filter((x) => x.id !== e.id) }))} aria-label={`Delete ${e.label}`} className="p-1 text-white/25 hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Net worth */}
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Net worth items</p>
            <div className="flex gap-2">
              <button onClick={() => addNetWorthItem('asset')} className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 cursor-pointer"><Plus size={12} /> Asset</button>
              <button onClick={() => addNetWorthItem('liability')} className="flex items-center gap-1 text-[11px] font-semibold text-red-400/80 hover:text-red-300 cursor-pointer"><Plus size={12} /> Liability</button>
            </div>
          </div>
          {f.netWorthItems.length === 0 ? (
            <p className="text-[13px] text-white/35">Track savings, FDs, gold, loans — anything beyond the portfolio.</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {f.netWorthItems.map((n) => (
                <li key={n.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.type === 'asset' ? 'bg-brand-400' : 'bg-red-400/80'}`} />
                  <span className="flex-1 truncate text-white/70">{n.label}</span>
                  <span className="font-semibold text-white/85">{n.type === 'liability' ? '−' : ''}{inr(n.amount)}</span>
                  <button onClick={() => updateFinance(updateState, (fs) => ({ ...fs, netWorthItems: fs.netWorthItems.filter((x) => x.id !== n.id) }))} aria-label={`Delete ${n.label}`} className="p-1 text-white/25 hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
