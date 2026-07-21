/**
 * Thin client for the read-only Kite proxies. The access token is passed per
 * request; a daily-expired session surfaces as KiteExpiredError so callers can
 * flip the connector to "expired" instead of failing opaquely.
 */

export class KiteExpiredError extends Error {}

export type KiteResource = 'holdings' | 'positions' | 'margins';

export interface KiteHolding {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  t1_quantity?: number;
  average_price: number;
  last_price: number;
  close_price?: number;
  pnl: number;
  day_change?: number;
  day_change_percentage?: number;
}

export interface KitePosition {
  tradingsymbol: string;
  exchange: string;
  product: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
}

export interface KitePositions {
  net: KitePosition[];
  day: KitePosition[];
}

export interface KiteMargins {
  equity?: { net?: number; available?: { cash?: number; live_balance?: number }; utilised?: { debits?: number } };
  commodity?: { net?: number };
}

export async function kiteFetch<T>(resource: KiteResource, token: string): Promise<T> {
  const res = await fetch(`/api/kite/${resource}`, { headers: { 'x-kite-token': token } });
  const data = (await res.json().catch(() => null)) as any;
  if (res.status === 401 && data?.code === 'kite_token_expired') {
    throw new KiteExpiredError(data.error ?? 'Kite session expired.');
  }
  if (!res.ok) throw new Error(data?.error ?? `Kite request failed (${res.status})`);
  return data as T;
}
