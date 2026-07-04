import { useEffect, useRef } from 'react';
import type { OSState, FinanceState } from '../../types';
import { EMPTY_FINANCE } from '../../types';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';
import { fetchQuotes, type Quote } from './quotesClient';

interface Deps {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

const finOf = (s: OSState): FinanceState => s.finance ?? EMPTY_FINANCE;

/**
 * Jarvis-side of the Stocks & Finance module: watchlist/portfolio quotes are
 * polled into context, and the manual trackers (watchlist, holdings, expenses,
 * budget, net worth) are steerable by voice/chat through tools.
 */
export default function StocksRegistrar({ state, updateState }: Deps) {
  const { registerTools, registerContext } = useJarvis();
  const quotesRef = useRef<Quote[]>([]);
  const stateRef = useRef<OSState>(state);
  stateRef.current = state;

  // Poll quotes for everything the user tracks (context freshness).
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const f = finOf(stateRef.current);
      const symbols = [...new Set([...f.holdings.map((h) => h.symbol), ...f.watchlist.map((w) => w.symbol)])];
      if (symbols.length === 0) {
        quotesRef.current = [];
        return;
      }
      try {
        const { quotes } = await fetchQuotes(symbols);
        if (!stop) quotesRef.current = quotes;
      } catch {
        /* best-effort — context keeps the last snapshot */
      }
    };
    load();
    const t = setInterval(load, 90_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    return registerContext('stocks', () => {
      const f = finOf(stateRef.current);
      const quote = (sym: string) => quotesRef.current.find((q) => q.symbol.toUpperCase() === sym.toUpperCase());
      const month = new Date().toISOString().slice(0, 7);
      const spent = f.expenses.filter((e) => e.at.slice(0, 7) === month).reduce((s, e) => s + e.amount, 0);
      const portfolioValue = f.holdings.reduce((s, h) => {
        const q = quote(h.symbol);
        return s + (q ? q.price * h.qty : h.avgCost * h.qty);
      }, 0);
      return {
        finance: {
          portfolio: f.holdings.map((h) => ({ symbol: h.symbol, qty: h.qty, avgCost: h.avgCost, price: quote(h.symbol)?.price ?? null })),
          portfolioValue,
          watchlist: f.watchlist.map((w) => ({
            symbol: w.symbol,
            price: quote(w.symbol)?.price ?? null,
            changePct: quote(w.symbol)?.changePct ?? null,
            alertAbove: w.alertAbove ?? null,
            alertBelow: w.alertBelow ?? null,
          })),
          budget: { monthlyCap: f.monthlyBudget ?? null, spentThisMonth: spent },
          netWorthItems: f.netWorthItems.length,
        },
      };
    });
  }, [registerContext]);

  useEffect(() => {
    const upd = (fn: (f: FinanceState) => FinanceState) => updateState((p) => ({ ...p, finance: fn(finOf(p)) }));
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };

    const tools: JarvisTool[] = [
      {
        name: 'getQuotes',
        module: 'Finance',
        description: 'Fetch live prices for stock symbols (Indian .NS/.BO or international, e.g. RELIANCE.NS, AAPL).',
        parameters: { symbols: 'comma-separated Yahoo symbols' },
        followUp: true,
        validate: (a) => (String(a.symbols ?? '').trim() ? null : 'symbols are required'),
        execute: async (a) => {
          try {
            const { quotes, failed } = await fetchQuotes(String(a.symbols).split(','));
            return {
              ok: true,
              message: `fetched ${quotes.length} quote${quotes.length === 1 ? '' : 's'}${failed.length ? ` (${failed.join(', ')} not found)` : ''}`,
              data: quotes,
            };
          } catch (e) {
            return { ok: false, message: `market data unavailable: ${(e as Error).message}` };
          }
        },
      },
      {
        name: 'watchSymbol',
        module: 'Finance',
        description: 'Add a stock symbol to the watchlist, optionally with price alerts.',
        parameters: { symbol: 'Yahoo symbol', alertAbove: 'optional price alert threshold', alertBelow: 'optional price alert threshold' },
        validate: (a) => (String(a.symbol ?? '').trim() ? null : 'symbol is required'),
        execute: (a) => {
          const symbol = String(a.symbol).trim().toUpperCase();
          upd((f) => ({
            ...f,
            watchlist: [
              ...f.watchlist.filter((w) => w.symbol !== symbol),
              {
                id: crypto.randomUUID(),
                symbol,
                alertAbove: Number.isFinite(num(a.alertAbove)) ? num(a.alertAbove) : undefined,
                alertBelow: Number.isFinite(num(a.alertBelow)) ? num(a.alertBelow) : undefined,
              },
            ],
          }));
          return { ok: true, message: `watching ${symbol}` };
        },
      },
      {
        name: 'addHolding',
        module: 'Finance',
        description: 'Record a portfolio holding (symbol, quantity, average cost per unit).',
        parameters: { symbol: 'Yahoo symbol', qty: 'units held', avgCost: 'average buy price per unit' },
        validate: (a) => {
          if (!String(a.symbol ?? '').trim()) return 'symbol is required';
          if (!(num(a.qty) > 0)) return 'qty must be a positive number';
          if (!(num(a.avgCost) >= 0)) return 'avgCost must be a number';
          return null;
        },
        execute: (a) => {
          const symbol = String(a.symbol).trim().toUpperCase();
          upd((f) => ({ ...f, holdings: [...f.holdings, { id: crypto.randomUUID(), symbol, qty: num(a.qty), avgCost: num(a.avgCost) }] }));
          return { ok: true, message: `holding added: ${num(a.qty)} × ${symbol}` };
        },
      },
      {
        name: 'logExpense',
        module: 'Finance',
        description: "Log a spend against this month's budget.",
        parameters: { label: 'what it was', amount: 'amount spent', category: 'optional category' },
        validate: (a) => {
          if (!String(a.label ?? '').trim()) return 'label is required';
          if (!(num(a.amount) > 0)) return 'amount must be positive';
          return null;
        },
        execute: (a) => {
          upd((f) => ({
            ...f,
            expenses: [
              ...f.expenses,
              { id: crypto.randomUUID(), label: String(a.label).trim(), amount: num(a.amount), category: a.category ? String(a.category) : undefined, at: new Date().toISOString() },
            ],
          }));
          return { ok: true, message: `expense logged: ${String(a.label).trim()} (${num(a.amount)})` };
        },
      },
      {
        name: 'setMonthlyBudget',
        module: 'Finance',
        description: 'Set (or clear with 0) the monthly spending cap.',
        parameters: { amount: 'monthly cap; 0 clears it' },
        validate: (a) => (num(a.amount) >= 0 ? null : 'amount must be a number'),
        execute: (a) => {
          const n = num(a.amount);
          upd((f) => ({ ...f, monthlyBudget: n > 0 ? n : undefined }));
          return { ok: true, message: n > 0 ? `monthly budget set to ${n}` : 'monthly budget cleared' };
        },
      },
      {
        name: 'addNetWorthItem',
        module: 'Finance',
        description: 'Track an asset or liability in the net-worth tracker.',
        parameters: { label: 'e.g. Savings account / Education loan', amount: 'current value', type: '"asset" or "liability"' },
        validate: (a) => {
          if (!String(a.label ?? '').trim()) return 'label is required';
          if (!(num(a.amount) >= 0)) return 'amount must be a number';
          if (a.type !== 'asset' && a.type !== 'liability') return 'type must be "asset" or "liability"';
          return null;
        },
        execute: (a) => {
          upd((f) => ({
            ...f,
            netWorthItems: [...f.netWorthItems, { id: crypto.randomUUID(), label: String(a.label).trim(), amount: num(a.amount), type: a.type as 'asset' | 'liability' }],
          }));
          return { ok: true, message: `${a.type} recorded: ${String(a.label).trim()}` };
        },
      },
    ];
    return registerTools('stocks', tools);
  }, [registerTools, updateState]);

  return null;
}
