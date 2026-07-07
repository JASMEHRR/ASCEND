import { authedFetch } from '../../lib/authedFetch';
import type { MatrixResult, Offer, OutreachPackage, ProspectList, SavedProspect } from './types';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await authedFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Thin client for the /api/launch/* AI endpoints. */
export const launchApi = {
  scoreIdea: (idea: string) => post<MatrixResult>('/api/launch/matrix', { idea }),
  generateOffer: (answers: Record<string, string>) => post<Offer>('/api/launch/offer', answers),
  buildProspects: (offer: Offer) => post<ProspectList>('/api/launch/prospects', { offer }),
  writeOutreach: (prospect: SavedProspect, offer: Offer) =>
    post<OutreachPackage>('/api/launch/outreach', { prospect, offer }),
};
