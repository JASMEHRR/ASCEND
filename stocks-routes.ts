/**
 * Stocks — Yahoo Finance proxy.
 *
 * Yahoo's public endpoints cover both Indian tickers (RELIANCE.NS, TCS.BO) and
 * international ones with no API key, but they are unofficial: responses are
 * cached for 60s and failures degrade to a clear error the client can show
 * (never a crash). No secrets involved.
 */
import { Router, type Request, type Response } from 'express';
import { logEvent } from './server-log';

export const stocksRouter = Router();

export interface Quote {
  symbol: string;
  name: string | null;
  price: number;
  prevClose: number | null;
  changePct: number | null;
  currency: string | null;
  exchange: string | null;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const cache = new Map<string, { at: number; quote: Quote }>();
const CACHE_MS = 60_000;

async function fetchQuote(symbol: string): Promise<Quote | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.quote;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') return null;

  const prevClose = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : null;
  const quote: Quote = {
    symbol: meta.symbol ?? symbol,
    name: meta.shortName ?? meta.longName ?? null,
    price: meta.regularMarketPrice,
    prevClose,
    changePct: prevClose ? ((meta.regularMarketPrice - prevClose) / prevClose) * 100 : null,
    currency: meta.currency ?? null,
    exchange: meta.exchangeName ?? null,
  };
  cache.set(symbol, { at: Date.now(), quote });
  return quote;
}

/** GET /api/stocks/quotes?symbols=RELIANCE.NS,AAPL — best-effort per symbol. */
stocksRouter.get('/quotes', async (req: Request, res: Response) => {
  const raw = String(req.query.symbols ?? '').trim();
  if (!raw) {
    res.status(400).json({ error: '`symbols` query param is required (comma-separated).' });
    return;
  }
  const symbols = [...new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 25);
  try {
    const results = await Promise.all(
      symbols.map(async (s) => {
        try {
          return await fetchQuote(s);
        } catch {
          return null;
        }
      }),
    );
    const quotes = results.filter((q): q is Quote => q !== null);
    const failed = symbols.filter((s) => !quotes.some((q) => q.symbol.toUpperCase() === s));
    res.json({ quotes, failed });
  } catch (err) {
    console.error('[stocks]', err);
    logEvent({ level: 'error', scope: 'stocks', message: (err as Error).message ?? 'quotes failed' });
    res.status(502).json({ error: 'Market data is unavailable right now (upstream error).' });
  }
});

/** GET /api/stocks/search?q=reliance — symbol lookup across exchanges. */
stocksRouter.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.status(400).json({ error: '`q` query param is required.' });
    return;
  }
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const res2 = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res2.ok) throw new Error(`upstream ${res2.status}`);
    const data: any = await res2.json();
    const matches = ((data?.quotes ?? []) as any[])
      .filter((m) => m.symbol && (m.quoteType === 'EQUITY' || m.quoteType === 'ETF' || m.quoteType === 'INDEX' || m.quoteType === 'MUTUALFUND'))
      .map((m) => ({ symbol: m.symbol, name: m.shortname ?? m.longname ?? null, exchange: m.exchDisp ?? m.exchange ?? null }));
    res.json({ matches });
  } catch (err) {
    console.error('[stocks:search]', err);
    logEvent({ level: 'error', scope: 'stocks', message: (err as Error).message ?? 'search failed' });
    res.status(502).json({ error: 'Symbol search is unavailable right now (upstream error).' });
  }
});
