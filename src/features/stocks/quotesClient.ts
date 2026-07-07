/** Client for the backend Yahoo proxy (/api/stocks). */
import { authedFetch } from '../../lib/authedFetch';

export interface Quote {
  symbol: string;
  name: string | null;
  price: number;
  prevClose: number | null;
  changePct: number | null;
  currency: string | null;
  exchange: string | null;
}

export interface QuotesResult {
  quotes: Quote[];
  /** Symbols the upstream couldn't resolve this round. */
  failed: string[];
}

export async function fetchQuotes(symbols: string[], signal?: AbortSignal): Promise<QuotesResult> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return { quotes: [], failed: [] };
  const res = await authedFetch(`/api/stocks/quotes?symbols=${encodeURIComponent(unique.join(','))}`, { signal });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Market data error (${res.status})`);
  return { quotes: data.quotes ?? [], failed: data.failed ?? [] };
}

export async function searchSymbols(q: string): Promise<{ symbol: string; name: string | null; exchange: string | null }[]> {
  const res = await authedFetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Symbol search error (${res.status})`);
  return data.matches ?? [];
}

/** Format an amount in a quote's currency (₹ for INR — Indian grouping, $ for USD, …). */
export function money(amount: number, currency: string | null): string {
  const cur = currency ?? 'INR';
  const locale = cur === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`.trim();
  }
}
