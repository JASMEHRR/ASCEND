import { useEffect, useRef } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';
import { useKite } from './KiteContext';
import { kiteFetch, KiteExpiredError, type KiteHolding, type KitePositions, type KiteMargins } from './kiteClient';

/**
 * Jarvis-side of the Kite Connect module: while connected, real brokerage
 * holdings are polled into context (so "how's my portfolio doing" answers with
 * live numbers) and read-only tools are registered. A daily token expiry flips
 * the connector to 'expired' and the tools report it plainly.
 */
export default function KiteRegistrar() {
  const { registerTools, registerContext } = useJarvis();
  const { connected, token, markExpired } = useKite();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const holdingsRef = useRef<KiteHolding[] | null>(null);

  // Poll holdings for context freshness (5 min — brokerage data moves slowly).
  useEffect(() => {
    if (!connected || !token) {
      holdingsRef.current = null;
      return;
    }
    let stop = false;
    const load = async () => {
      try {
        const h = await kiteFetch<KiteHolding[]>('holdings', token);
        if (!stop) holdingsRef.current = h;
      } catch (e) {
        if (!stop && e instanceof KiteExpiredError) markExpired();
        /* otherwise best-effort — context keeps the last snapshot */
      }
    };
    load();
    const t = setInterval(load, 300_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [connected, token, markExpired]);

  useEffect(() => {
    if (!connected) return;
    return registerContext('kite', () => {
      const h = holdingsRef.current;
      if (!h) return { kiteBroker: { connected: true, holdings: 'loading' } };
      const invested = h.reduce((s, x) => s + x.average_price * x.quantity, 0);
      const current = h.reduce((s, x) => s + x.last_price * x.quantity, 0);
      const dayPnl = h.reduce((s, x) => s + (x.day_change ?? 0) * x.quantity, 0);
      return {
        kiteBroker: {
          connected: true,
          currency: 'INR',
          holdingsCount: h.length,
          investedValue: Math.round(invested),
          currentValue: Math.round(current),
          totalPnl: Math.round(current - invested),
          dayPnl: Math.round(dayPnl),
          topHoldings: [...h]
            .sort((a, b) => b.last_price * b.quantity - a.last_price * a.quantity)
            .slice(0, 5)
            .map((x) => ({ symbol: x.tradingsymbol, qty: x.quantity, value: Math.round(x.last_price * x.quantity) })),
        },
      };
    });
  }, [connected, registerContext]);

  useEffect(() => {
    if (!connected) return;

    /** Map a failed Kite call to a spoken-friendly message (and flag expiry). */
    const failMessage = (e: unknown): string => {
      if (e instanceof KiteExpiredError) {
        markExpired();
        return 'Kite session expired — reconnect from Settings.';
      }
      return `Kite unavailable: ${(e as Error).message}`;
    };

    const tools: JarvisTool[] = [
      {
        name: 'getPortfolio',
        module: 'Broker',
        description: "Fetch the user's REAL Zerodha brokerage holdings (long-term portfolio) with live P&L. Use for questions about their actual portfolio/investments.",
        followUp: true,
        execute: async () => {
          const tok = tokenRef.current;
          if (!tok) return { ok: false, message: 'Kite is not connected.' };
          try {
            const h = await kiteFetch<KiteHolding[]>('holdings', tok);
            holdingsRef.current = h;
            const invested = h.reduce((s, x) => s + x.average_price * x.quantity, 0);
            const current = h.reduce((s, x) => s + x.last_price * x.quantity, 0);
            return {
              ok: true,
              message: `fetched ${h.length} holding${h.length === 1 ? '' : 's'} from Zerodha`,
              data: {
                currency: 'INR',
                investedValue: Math.round(invested),
                currentValue: Math.round(current),
                totalPnl: Math.round(current - invested),
                holdings: h.map((x) => ({
                  symbol: x.tradingsymbol,
                  qty: x.quantity,
                  avgPrice: x.average_price,
                  lastPrice: x.last_price,
                  pnl: Math.round(x.pnl),
                  dayChangePct: x.day_change_percentage ?? null,
                })),
              },
            };
          } catch (e) {
            return { ok: false, message: failMessage(e) };
          }
        },
      },
      {
        name: 'getPositions',
        module: 'Broker',
        description: "Fetch the user's open intraday/derivative positions at Zerodha (today's trades, not long-term holdings).",
        followUp: true,
        execute: async () => {
          const tok = tokenRef.current;
          if (!tok) return { ok: false, message: 'Kite is not connected.' };
          try {
            const positions = await kiteFetch<KitePositions>('positions', tok);
            const net = positions.net ?? [];
            return {
              ok: true,
              message: `fetched ${net.length} open position${net.length === 1 ? '' : 's'}`,
              data: net.map((p) => ({
                symbol: p.tradingsymbol,
                product: p.product,
                qty: p.quantity,
                avgPrice: p.average_price,
                lastPrice: p.last_price,
                pnl: Math.round(p.pnl),
              })),
            };
          } catch (e) {
            return { ok: false, message: failMessage(e) };
          }
        },
      },
      {
        name: 'getMargins',
        module: 'Broker',
        description: "Fetch the user's available funds/margins at Zerodha (cash available to invest).",
        followUp: true,
        execute: async () => {
          const tok = tokenRef.current;
          if (!tok) return { ok: false, message: 'Kite is not connected.' };
          try {
            const margins = await kiteFetch<KiteMargins>('margins', tok);
            const eq = margins.equity;
            return {
              ok: true,
              message: 'fetched Zerodha margins',
              data: {
                currency: 'INR',
                availableCash: eq?.available?.cash ?? eq?.available?.live_balance ?? null,
                netBalance: eq?.net ?? null,
                utilised: eq?.utilised?.debits ?? null,
              },
            };
          } catch (e) {
            return { ok: false, message: failMessage(e) };
          }
        },
      },
    ];
    return registerTools('kite', tools);
  }, [connected, registerTools, markExpired]);

  return null;
}
