/**
 * Live web search for Jarvis, proxied through Tavily (free tier: ~1000
 * searches/month, no card). The TAVILY_API_KEY stays server-side; the client
 * exposes this as a `webSearch` Jarvis tool, so the model itself decides when
 * a query actually needs live data instead of firing a search on every turn.
 *
 * Google Search grounding was deliberately NOT used: it would force responses
 * through Gemini, whose tiny free daily quota is now the emergency chat
 * fallback (see llm.ts) — spending it on search would cannibalize resilience.
 */
import { Router, type Request, type Response } from 'express';

export const searchRouter = Router();

searchRouter.get('/', async (req: Request, res: Response) => {
  try {
    const key = process.env.TAVILY_API_KEY;
    if (!key) {
      res.status(503).json({ error: 'Web search is not configured.', code: 'not_configured' });
      return;
    }

    const q = String(req.query.q ?? '').trim().slice(0, 400);
    if (!q) {
      res.status(400).json({ error: 'Provide a search query via ?q=.' });
      return;
    }

    const upstream = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, search_depth: 'basic', max_results: 5, include_answer: true }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 300);
      const quota = upstream.status === 429 || upstream.status === 432 || /limit|quota/i.test(detail);
      if (!quota) console.error('[search] upstream', upstream.status, detail);
      res
        .status(quota ? 429 : 502)
        .json({ error: quota ? 'Search quota exhausted for the month.' : 'Search failed upstream.', code: quota ? 'quota' : 'upstream' });
      return;
    }

    const data = (await upstream.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    res.json({
      answer: data.answer ?? null,
      results: (data.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: (r.content ?? '').slice(0, 300),
      })),
    });
  } catch (err) {
    console.error('[search]', err);
    res.status(502).json({ error: 'Search request failed.', code: 'upstream' });
  }
});
