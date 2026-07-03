/**
 * LaunchKit AI endpoints, integrated into ASCEND's Express server.
 *
 * These are stateless: all context comes in the request body and the generated
 * JSON is returned to the client, which persists it in Firestore (per user).
 * The AI provider is ASCEND's existing Gemini (@google/genai) — no extra deps
 * or API keys. Mounted under /api/launch by server.ts.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';

export const launchRouter = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/**
 * Pull a JSON object out of a model response, tolerating ```json fences,
 * a leading <think>…</think> block, or prose around the object.
 */
function extractJson(raw: string): string {
  let text = raw.trim();
  const thinkEnd = text.lastIndexOf('</think>');
  if (thinkEnd !== -1) text = text.slice(thinkEnd + '</think>'.length).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (text.startsWith('{') && text.endsWith('}')) return text;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text;
}

/** One structured-output call to Gemini: returns JSON parsed to T. */
async function structuredGenerate<T>(opts: {
  system: string;
  prompt: string;
  schema: object;
  maxTokens?: number;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new HttpError(500, 'Missing GEMINI_API_KEY environment variable.');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const system = `${opts.system}

Respond with a single JSON object and nothing else — no prose, no markdown fences. It must conform exactly to this JSON Schema (every required field, correct types):

${JSON.stringify(opts.schema, null, 2)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: opts.prompt,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      maxOutputTokens: opts.maxTokens ?? 8192,
    },
  });

  const text = response.text ?? '';
  if (!text) throw new HttpError(502, 'The model returned no output. Please try again.');
  try {
    return JSON.parse(extractJson(text)) as T;
  } catch {
    throw new HttpError(502, 'The model did not return valid JSON. Please try again.');
  }
}

// --- JSON schemas (in-prompt; describe the expected output shape) ---
const matrixSchema = {
  type: 'object',
  properties: {
    demand: { type: 'integer', description: '0 (nobody wants this) to 100 (urgent, widespread, funded demand).' },
    competition: { type: 'integer', description: '0 (almost nobody sells this) to 100 (saturated red ocean).' },
    quadrant: { type: 'string', enum: ['blue_ocean', 'red_ocean', 'dead_zone', 'too_niche'] },
    explanation: { type: 'string', description: '3-5 sentences on both scores: who buys this and who already sells it.' },
    recommendation: { type: 'string', description: 'Direct advice: pursue as-is, reposition, or drop — and why.' },
    pivotSuggestion: { type: 'string', description: 'If not blue ocean: one concrete repositioning toward low competition / high demand. If blue ocean: how to defend it.' },
  },
  required: ['demand', 'competition', 'quadrant', 'explanation', 'recommendation', 'pivotSuggestion'],
};

const pricingTier = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    price: { type: 'integer', description: 'Monthly USD price. Charged by result, never by the hour.' },
    deliverables: { type: 'array', items: { type: 'string' } },
    bestFor: { type: 'string' },
  },
  required: ['name', 'price', 'deliverables', 'bestFor'],
};

const offerSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short, punchy name for the offer.' },
    whatYouSell: { type: 'string', description: 'The AI-powered service, framed as a result — never hours.' },
    whoYouSellTo: { type: 'string', description: 'Ideal customer: specific role, company stage, and the pain that makes them buy now.' },
    pricingTiers: { type: 'array', description: 'Exactly 3 tiers, priced by result (e.g. 1500 / 3000 / 6000 per month).', items: pricingTier },
    offerSummary: { type: 'string', description: 'A one-page summary to paste into a doc or DM. Plain prose, 150-250 words.' },
    whyBlueOcean: { type: 'string', description: 'Why this sits in the low-competition / high-demand quadrant.' },
    competitors: {
      type: 'array',
      description: '3-5 likely competitors or categories with differentiation notes.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          howToDifferentiate: { type: 'string' },
        },
        required: ['name', 'description', 'howToDifferentiate'],
      },
    },
    sevenDayPlan: {
      type: 'array',
      description: 'A 7-day action plan to land the first high-paying client. Sell before you build.',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          title: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
        },
        required: ['day', 'title', 'actions'],
      },
    },
  },
  required: ['title', 'whatYouSell', 'whoYouSellTo', 'pricingTiers', 'offerSummary', 'whyBlueOcean', 'competitors', 'sevenDayPlan'],
};

const prospectsSchema = {
  type: 'object',
  properties: {
    prospects: {
      type: 'array',
      description: 'About 10 realistic prospect profiles (archetypes, not real named individuals) that fit the offer.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "Archetype label, e.g. 'Series-A SaaS founder (dev-tools)'. Never a real person's identity." },
          role: { type: 'string' },
          companyType: { type: 'string' },
          signal: { type: 'string', description: 'The observable buying signal.' },
          whyLikely: { type: 'string', description: 'Why response likelihood is high: wants the result, not good at it yet.' },
          openingAngle: { type: 'string' },
          whereToFind: { type: 'string', description: 'Concretely where to find people matching this profile.' },
        },
        required: ['name', 'role', 'companyType', 'signal', 'whyLikely', 'openingAngle', 'whereToFind'],
      },
    },
    researchNotes: { type: 'string', description: '2-3 sentences on where these buyers congregate right now.' },
  },
  required: ['prospects', 'researchNotes'],
};

const sequence = {
  type: 'object',
  properties: {
    connectionMessage: { type: 'string', description: 'Short LinkedIn connection note. No pitch. Under 300 characters.' },
    followUp: { type: 'string', description: 'First DM after connecting.' },
    loomScript: { type: 'string', description: '60-90 second Loom script: greeting, 2 genuine observations, 1 concrete missed opportunity, soft CTA.' },
    replyHandling: {
      type: 'array',
      description: '3-4 common replies and how to respond.',
      items: {
        type: 'object',
        properties: { ifTheySay: { type: 'string' }, respondWith: { type: 'string' } },
        required: ['ifTheySay', 'respondWith'],
      },
    },
    callBookingAsk: { type: 'string', description: 'The message that asks for the call. Low-pressure, specific time framing.' },
  },
  required: ['connectionMessage', 'followUp', 'loomScript', 'replyHandling', 'callBookingAsk'],
};

const outreachSchema = {
  type: 'object',
  properties: {
    outbound: { ...sequence, description: 'Cold variant: agitate a specific pain, then offer a free audit.' },
    inbound: { ...sequence, description: 'Warm variant: compliment something specific, then ask a this-or-that qualifying question.' },
  },
  required: ['outbound', 'inbound'],
};

// --- Endpoints ---

launchRouter.post(
  '/matrix',
  wrap(async (req, res) => {
    const idea = String(req.body?.idea ?? '').trim();
    if (!idea) {
      res.status(400).json({ error: 'Provide an idea to score.' });
      return;
    }
    const result = await structuredGenerate({
      system: `You score business ideas on the Business Opportunity Matrix from Patrick Dang's one-person-AI-business methodology.

The matrix: x-axis is competition (low to high), y-axis is demand (low to high).
- Blue Ocean (low competition, high demand): the target. People urgently want it and few sell it.
- Red Ocean (high competition, high demand): real money but you'll bleed fighting incumbents.
- Dead Zone (high competition, low demand): worst spot — crowded AND nobody's buying.
- Too Niche (low competition, low demand): easy to enter but no market to feed you.

Score honestly and calibrate against the real market: "AI resume writing" is red ocean; "AI-powered YouTube content machine for VC-backed founders" is blue ocean. Judge the idea AS POSITIONED. Quadrant boundaries: demand >= 55 is "high demand", competition <= 45 is "low competition". Keep scores consistent with the quadrant you assign.`,
      prompt: `Score this business idea on the matrix:\n\n"${idea}"`,
      schema: matrixSchema,
      maxTokens: 4000,
    });
    res.json(result);
  }),
);

launchRouter.post(
  '/offer',
  wrap(async (req, res) => {
    const { skills, knowledge, experience, interests, notes } = req.body ?? {};
    if (!skills && !knowledge && !experience && !interests) {
      res.status(400).json({ error: 'Fill in at least one of the wizard fields first.' });
      return;
    }
    const result = await structuredGenerate({
      system: `You are the "AI Business Idea Generator" from Patrick Dang's one-person-AI-business masterclass. You build offers using the Offer Triangle:

1. WHAT you sell — an AI-powered service, framed as a result/outcome, never hours.
2. WHO you sell to — one specific ideal customer with money and an urgent pain.
3. PRICING — charged by result, 3 tiers (anchor around 1.5K / 3K / 6K per month; adjust to the market but never race to the bottom).

Rules: Sell before you build — the 7-day plan lands a first client conversation before any tooling. Combine the person's existing skills with what's trending in AI. The offer must sit in the Blue Ocean quadrant (high demand, low competition); position narrowly. Competitor list must be honest. Everything must be executable by ONE person using AI leverage — no hiring, no funding.`,
      prompt: `Build me an offer from these inputs:

Skills: ${skills || '(not given)'}
Knowledge: ${knowledge || '(not given)'}
Experience: ${experience || '(not given)'}
Interests: ${interests || '(not given)'}
Extra notes: ${notes || '(none)'}

Produce the complete offer package: the offer triangle, 3 pricing tiers, a one-page summary, why it's blue ocean, competitors + differentiation, and a 7-day plan to land the first high-paying client.`,
      schema: offerSchema,
      maxTokens: 8000,
    });
    res.json(result);
  }),
);

launchRouter.post(
  '/prospects',
  wrap(async (req, res) => {
    const offer = req.body?.offer;
    if (!offer?.title || !offer?.whatYouSell || !offer?.whoYouSellTo) {
      res.status(400).json({ error: 'An active offer is required. Generate and save an offer first.' });
      return;
    }
    const result = await structuredGenerate({
      system: `You are a targeted-list builder for a one-person AI business. Given an offer, you produce ~10 realistic prospect PROFILES (archetypes, not real named individuals) matching the ideal customer.

The core heuristic — buying signals: look for people who visibly WANT the result but visibly AREN'T good at it yet. Ground the profiles in where these buyers congregate, what they complain about, which communities/search queries surface them. Do NOT invent real people's names — every "name" is an archetype label.`,
      prompt: `Build a targeted prospect list for this offer:

OFFER: ${offer.title}
WHAT: ${offer.whatYouSell}
WHO (ideal customer): ${offer.whoYouSellTo}

Return ~10 prospect profiles with: the buying signal to look for, why response likelihood is high, a suggested opening angle, and concretely where to find them.`,
      schema: prospectsSchema,
      maxTokens: 8000,
    });
    res.json(result);
  }),
);

launchRouter.post(
  '/outreach',
  wrap(async (req, res) => {
    const { prospect, offer } = req.body ?? {};
    if (!prospect?.name || !offer?.title) {
      res.status(400).json({ error: 'A saved prospect and an active offer are required.' });
      return;
    }
    const result = await structuredGenerate({
      system: `You write LinkedIn/cold outreach sequences for a one-person AI business, following Patrick Dang's playbook.

Each sequence has 5 steps: connection message -> follow-up DM -> Loom video script -> reply handling -> call-booking ask.

Two variants:
- OUTBOUND (cold): agitate a specific, observable pain, then offer a FREE AUDIT. Never pitch price in the first messages.
- INBOUND/WARM: open by complimenting something SPECIFIC they did, then ask a this-or-that qualifying question.

Tone: human, short sentences, zero corporate fluff, no "I hope this finds you well". Reference the prospect's actual buying signal. The goal of every sequence is a 20-minute call, not a sale in DMs.`,
      prompt: `Write both outreach variants (outbound + inbound) for this prospect and offer:

PROSPECT: ${prospect.name} — ${prospect.role} at ${prospect.companyType}
BUYING SIGNAL: ${prospect.signal}
OPENING ANGLE: ${prospect.openingAngle}

OFFER: ${offer.title}
WHAT WE SELL: ${offer.whatYouSell}
WHO IT'S FOR: ${offer.whoYouSellTo}`,
      schema: outreachSchema,
      maxTokens: 8000,
    });
    res.json(result);
  }),
);

// Central error handler for this router.
launchRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Launch AI request failed';
  if (status >= 500) console.error('[launch]', err);
  res.status(status).json({ error: message });
});
