import { useEffect } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';

/**
 * Gives Jarvis live internet access as a followUp tool: the model decides when
 * a question actually needs live data (current events, weather, news, prices),
 * calls webSearch, and the tool result is fed back for a grounded answer —
 * reusing the existing tool-call loop instead of searching on every message.
 * Backed by /api/search (Tavily, key server-side).
 */
export default function WebSearchRegistrar() {
  const { registerTools } = useJarvis();

  useEffect(() => {
    const tools: JarvisTool[] = [
      {
        name: 'webSearch',
        module: 'Web',
        description:
          'Search the live internet. Use ONLY when the answer needs current/real-time information — news, current events, weather, sports scores, live prices, recent releases, or anything after your knowledge cutoff ("today", "latest", "right now"). Never use it for general knowledge you already know or for data already present in CONTEXT.',
        parameters: { query: 'the search query, phrased like a search-engine query' },
        followUp: true,
        validate: (a) => (String(a.query ?? '').trim() ? null : 'query is required'),
        execute: async (a) => {
          const query = String(a.query).trim();
          try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json().catch(() => null);
            if (!res.ok) {
              return { ok: false, message: `web search unavailable: ${data?.error ?? `status ${res.status}`}` };
            }
            return {
              ok: true,
              message: `searched the web: ${query}`,
              data: {
                answer: data?.answer ?? null,
                results: Array.isArray(data?.results) ? data.results.slice(0, 3) : [],
              },
            };
          } catch (e) {
            return { ok: false, message: `web search unavailable: ${(e as Error).message}` };
          }
        },
      },
    ];
    return registerTools('websearch', tools);
  }, [registerTools]);

  return null;
}
