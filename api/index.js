// server.ts
import express from "express";
import dotenv from "dotenv";

// gemini.ts
var GEMINI_MODEL = "gemini-2.5-flash";
var GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
function isQuotaError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|"code"\s*:\s*429|exceeded your current quota|rate.?limit/i.test(msg);
}
var GeminiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var clientPromise = null;
async function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError(500, "Missing GEMINI_API_KEY environment variable.");
  if (!clientPromise) {
    clientPromise = import("@google/genai").then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
  }
  return clientPromise;
}
function extractJson(raw) {
  let text = raw.trim();
  const thinkEnd = text.lastIndexOf("</think>");
  if (thinkEnd !== -1) text = text.slice(thinkEnd + "</think>".length).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text;
}

// llm.ts
var NIM_MODEL = "meta/llama-4-maverick-17b-128e-instruct";
var NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
var NIM_TIMEOUT_MS = 45e3;
async function callNim(opts, apiKey) {
  const body = {
    model: NIM_MODEL,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.6,
    stream: false
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const post = (payload) => fetch(NIM_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(NIM_TIMEOUT_MS)
  });
  let res = await post(body);
  if (res.status === 400 && opts.json) {
    const { response_format: _drop, ...withoutFormat } = body;
    res = await post(withoutFormat);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`NIM ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("NIM returned empty content");
  return text;
}
async function callGemini(opts, model) {
  const ai = await getGemini();
  const response = await ai.models.generateContent({
    model,
    contents: opts.messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    })),
    config: {
      systemInstruction: opts.system,
      maxOutputTokens: opts.maxTokens ?? 4096,
      ...opts.json ? { responseMimeType: "application/json" } : {},
      ...opts.temperature !== void 0 ? { temperature: opts.temperature } : {}
    }
  });
  return response.text ?? "";
}
async function generateChat(opts) {
  const nimKey = process.env.NVIDIA_API_KEY;
  if (nimKey) {
    try {
      return await callNim(opts, nimKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[llm] NIM failed, falling back to Gemini:", msg);
    }
  }
  try {
    return await callGemini(opts, GEMINI_MODEL);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    try {
      return await callGemini(opts, GEMINI_FALLBACK_MODEL);
    } catch (err2) {
      if (isQuotaError(err2)) {
        throw new GeminiError(
          429,
          "I've hit the limits on every AI provider for now, sir \u2014 quotas reset within minutes to hours. Give it a short while and try again."
        );
      }
      throw err2;
    }
  }
}
async function generateStructured(opts) {
  const system = `${opts.system}

Respond with a single JSON object and nothing else \u2014 no prose, no markdown fences. It must conform exactly to this JSON Schema (every required field, correct types):

${JSON.stringify(opts.schema, null, 2)}`;
  const text = await generateChat({
    system,
    messages: [{ role: "user", content: opts.prompt }],
    json: true,
    maxTokens: opts.maxTokens ?? 8192
  });
  if (!text) throw new GeminiError(502, "The model returned no output. Please try again.");
  try {
    return JSON.parse(extractJson(text));
  } catch {
    throw new GeminiError(502, "The model did not return valid JSON. Please try again.");
  }
}

// launch-routes.ts
import { Router } from "express";
var launchRouter = Router();
var wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
var structuredGenerate = generateStructured;
var matrixSchema = {
  type: "object",
  properties: {
    demand: { type: "integer", description: "0 (nobody wants this) to 100 (urgent, widespread, funded demand)." },
    competition: { type: "integer", description: "0 (almost nobody sells this) to 100 (saturated red ocean)." },
    quadrant: { type: "string", enum: ["blue_ocean", "red_ocean", "dead_zone", "too_niche"] },
    explanation: { type: "string", description: "3-5 sentences on both scores: who buys this and who already sells it." },
    recommendation: { type: "string", description: "Direct advice: pursue as-is, reposition, or drop \u2014 and why." },
    pivotSuggestion: { type: "string", description: "If not blue ocean: one concrete repositioning toward low competition / high demand. If blue ocean: how to defend it." }
  },
  required: ["demand", "competition", "quadrant", "explanation", "recommendation", "pivotSuggestion"]
};
var pricingTier = {
  type: "object",
  properties: {
    name: { type: "string" },
    price: { type: "integer", description: "Monthly USD price. Charged by result, never by the hour." },
    deliverables: { type: "array", items: { type: "string" } },
    bestFor: { type: "string" }
  },
  required: ["name", "price", "deliverables", "bestFor"]
};
var offerSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short, punchy name for the offer." },
    whatYouSell: { type: "string", description: "The AI-powered service, framed as a result \u2014 never hours." },
    whoYouSellTo: { type: "string", description: "Ideal customer: specific role, company stage, and the pain that makes them buy now." },
    pricingTiers: { type: "array", description: "Exactly 3 tiers, priced by result (e.g. 1500 / 3000 / 6000 per month).", items: pricingTier },
    offerSummary: { type: "string", description: "A one-page summary to paste into a doc or DM. Plain prose, 150-250 words." },
    whyBlueOcean: { type: "string", description: "Why this sits in the low-competition / high-demand quadrant." },
    competitors: {
      type: "array",
      description: "3-5 likely competitors or categories with differentiation notes.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          howToDifferentiate: { type: "string" }
        },
        required: ["name", "description", "howToDifferentiate"]
      }
    },
    sevenDayPlan: {
      type: "array",
      description: "A 7-day action plan to land the first high-paying client. Sell before you build.",
      items: {
        type: "object",
        properties: {
          day: { type: "integer" },
          title: { type: "string" },
          actions: { type: "array", items: { type: "string" } }
        },
        required: ["day", "title", "actions"]
      }
    }
  },
  required: ["title", "whatYouSell", "whoYouSellTo", "pricingTiers", "offerSummary", "whyBlueOcean", "competitors", "sevenDayPlan"]
};
var prospectsSchema = {
  type: "object",
  properties: {
    prospects: {
      type: "array",
      description: "About 10 realistic prospect profiles (archetypes, not real named individuals) that fit the offer.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Archetype label, e.g. 'Series-A SaaS founder (dev-tools)'. Never a real person's identity." },
          role: { type: "string" },
          companyType: { type: "string" },
          signal: { type: "string", description: "The observable buying signal." },
          whyLikely: { type: "string", description: "Why response likelihood is high: wants the result, not good at it yet." },
          openingAngle: { type: "string" },
          whereToFind: { type: "string", description: "Concretely where to find people matching this profile." }
        },
        required: ["name", "role", "companyType", "signal", "whyLikely", "openingAngle", "whereToFind"]
      }
    },
    researchNotes: { type: "string", description: "2-3 sentences on where these buyers congregate right now." }
  },
  required: ["prospects", "researchNotes"]
};
var sequence = {
  type: "object",
  properties: {
    connectionMessage: { type: "string", description: "Short LinkedIn connection note. No pitch. Under 300 characters." },
    followUp: { type: "string", description: "First DM after connecting." },
    loomScript: { type: "string", description: "60-90 second Loom script: greeting, 2 genuine observations, 1 concrete missed opportunity, soft CTA." },
    replyHandling: {
      type: "array",
      description: "3-4 common replies and how to respond.",
      items: {
        type: "object",
        properties: { ifTheySay: { type: "string" }, respondWith: { type: "string" } },
        required: ["ifTheySay", "respondWith"]
      }
    },
    callBookingAsk: { type: "string", description: "The message that asks for the call. Low-pressure, specific time framing." }
  },
  required: ["connectionMessage", "followUp", "loomScript", "replyHandling", "callBookingAsk"]
};
var outreachSchema = {
  type: "object",
  properties: {
    outbound: { ...sequence, description: "Cold variant: agitate a specific pain, then offer a free audit." },
    inbound: { ...sequence, description: "Warm variant: compliment something specific, then ask a this-or-that qualifying question." }
  },
  required: ["outbound", "inbound"]
};
launchRouter.post(
  "/matrix",
  wrap(async (req, res) => {
    const idea = String(req.body?.idea ?? "").trim();
    if (!idea) {
      res.status(400).json({ error: "Provide an idea to score." });
      return;
    }
    const result = await structuredGenerate({
      system: `You score business ideas on the Business Opportunity Matrix from Patrick Dang's one-person-AI-business methodology.

The matrix: x-axis is competition (low to high), y-axis is demand (low to high).
- Blue Ocean (low competition, high demand): the target. People urgently want it and few sell it.
- Red Ocean (high competition, high demand): real money but you'll bleed fighting incumbents.
- Dead Zone (high competition, low demand): worst spot \u2014 crowded AND nobody's buying.
- Too Niche (low competition, low demand): easy to enter but no market to feed you.

Score honestly and calibrate against the real market: "AI resume writing" is red ocean; "AI-powered YouTube content machine for VC-backed founders" is blue ocean. Judge the idea AS POSITIONED. Quadrant boundaries: demand >= 55 is "high demand", competition <= 45 is "low competition". Keep scores consistent with the quadrant you assign.`,
      prompt: `Score this business idea on the matrix:

"${idea}"`,
      schema: matrixSchema,
      maxTokens: 4e3
    });
    res.json(result);
  })
);
launchRouter.post(
  "/offer",
  wrap(async (req, res) => {
    const { skills, knowledge, experience, interests, notes } = req.body ?? {};
    if (!skills && !knowledge && !experience && !interests) {
      res.status(400).json({ error: "Fill in at least one of the wizard fields first." });
      return;
    }
    const result = await structuredGenerate({
      system: `You are the "AI Business Idea Generator" from Patrick Dang's one-person-AI-business masterclass. You build offers using the Offer Triangle:

1. WHAT you sell \u2014 an AI-powered service, framed as a result/outcome, never hours.
2. WHO you sell to \u2014 one specific ideal customer with money and an urgent pain.
3. PRICING \u2014 charged by result, 3 tiers (anchor around 1.5K / 3K / 6K per month; adjust to the market but never race to the bottom).

Rules: Sell before you build \u2014 the 7-day plan lands a first client conversation before any tooling. Combine the person's existing skills with what's trending in AI. The offer must sit in the Blue Ocean quadrant (high demand, low competition); position narrowly. Competitor list must be honest. Everything must be executable by ONE person using AI leverage \u2014 no hiring, no funding.`,
      prompt: `Build me an offer from these inputs:

Skills: ${skills || "(not given)"}
Knowledge: ${knowledge || "(not given)"}
Experience: ${experience || "(not given)"}
Interests: ${interests || "(not given)"}
Extra notes: ${notes || "(none)"}

Produce the complete offer package: the offer triangle, 3 pricing tiers, a one-page summary, why it's blue ocean, competitors + differentiation, and a 7-day plan to land the first high-paying client.`,
      schema: offerSchema,
      maxTokens: 8e3
    });
    res.json(result);
  })
);
launchRouter.post(
  "/prospects",
  wrap(async (req, res) => {
    const offer = req.body?.offer;
    if (!offer?.title || !offer?.whatYouSell || !offer?.whoYouSellTo) {
      res.status(400).json({ error: "An active offer is required. Generate and save an offer first." });
      return;
    }
    const result = await structuredGenerate({
      system: `You are a targeted-list builder for a one-person AI business. Given an offer, you produce ~10 realistic prospect PROFILES (archetypes, not real named individuals) matching the ideal customer.

The core heuristic \u2014 buying signals: look for people who visibly WANT the result but visibly AREN'T good at it yet. Ground the profiles in where these buyers congregate, what they complain about, which communities/search queries surface them. Do NOT invent real people's names \u2014 every "name" is an archetype label.`,
      prompt: `Build a targeted prospect list for this offer:

OFFER: ${offer.title}
WHAT: ${offer.whatYouSell}
WHO (ideal customer): ${offer.whoYouSellTo}

Return ~10 prospect profiles with: the buying signal to look for, why response likelihood is high, a suggested opening angle, and concretely where to find them.`,
      schema: prospectsSchema,
      maxTokens: 8e3
    });
    res.json(result);
  })
);
launchRouter.post(
  "/outreach",
  wrap(async (req, res) => {
    const { prospect, offer } = req.body ?? {};
    if (!prospect?.name || !offer?.title) {
      res.status(400).json({ error: "A saved prospect and an active offer are required." });
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

PROSPECT: ${prospect.name} \u2014 ${prospect.role} at ${prospect.companyType}
BUYING SIGNAL: ${prospect.signal}
OPENING ANGLE: ${prospect.openingAngle}

OFFER: ${offer.title}
WHAT WE SELL: ${offer.whatYouSell}
WHO IT'S FOR: ${offer.whoYouSellTo}`,
      schema: outreachSchema,
      maxTokens: 8e3
    });
    res.json(result);
  })
);
launchRouter.use((err, _req, res, _next) => {
  const status = err instanceof GeminiError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Launch AI request failed";
  if (status >= 500) console.error("[launch]", err);
  res.status(status).json({ error: message });
});

// jarvis-routes.ts
import { Router as Router2 } from "express";
var jarvisRouter = Router2();
var PERSONA = `You are JARVIS, the AI command core of Ascend Protocol \u2014 a personal life-management operating system. You are calm, sharp, lightly witty (Iron Man's JARVIS energy). Address the user as "sir" occasionally, never every message. Speak like an OS the user trusts, not a chatbot.

You are ALSO a fully capable general-purpose assistant. When the user asks about anything unrelated to Ascend \u2014 general knowledge, explanations, advice, math, writing, current topics, casual conversation \u2014 answer it directly and completely, exactly as a top-tier AI assistant would. NEVER refuse, deflect, or say you can only help with app-related things. App awareness layers on top of general capability; it never limits it.

This is an ongoing conversation: the message history contains the prior turns of this session. Maintain continuity \u2014 remember and reference what was said earlier in the conversation, resolve pronouns and follow-ups against previous messages, and never treat a follow-up as a brand-new request.

You receive a CONTEXT snapshot of the live app: the current page, the user's metrics (discipline score, streak, water, steps, weight, points), rituals, tasks, primary objective, ideas, pain levels, business pipeline, and a MEMORY block (facts the user asked you to remember + your recent actions). Use it to answer with real numbers \u2014 never invent values. If the answer is already in context, just answer; don't call a tool. Don't ask for information the context already contains.

You control the app by calling TOOLS. Rules:
- Only use tools from the list; match argument names exactly.
- For a compound request ("plan my day", "log my morning") break it into MULTIPLE tool calls in one response, ordered sensibly.
- Give each tool call a "confidence" from 0 to 1 (how sure you are it's the right action + args). Use < 0.5 only when genuinely unsure.
- If the request is truly ambiguous or missing something essential, set "needsClarification": true, return an empty toolCalls array, and ask ONE short question \u2014 otherwise infer sensibly and act.
- Briefly explain multi-step actions in "plan".

Reply lengths:
- "reply" is what is DISPLAYED. For confirmations of actions, keep it to a sentence or two. For informational or general-knowledge questions, give a genuinely useful, complete answer \u2014 markdown lists, tables, and code blocks are supported. Do not artificially truncate a real answer.
- "speak" is the short spoken version (under ~40 words), read aloud via text-to-speech. Include it whenever "reply" is more than a couple of sentences; omit it when "reply" is already short.`;
function buildSystem(tools, context) {
  const toolLines = tools.map((t) => {
    const params = t.parameters && Object.keys(t.parameters).length ? Object.entries(t.parameters).map(([k, d]) => `${k} (${d})`).join(", ") : "none";
    return `- ${t.name}${t.module ? ` [${t.module}]` : ""}: ${t.description}. args: ${params}`;
  }).join("\n");
  return `${PERSONA}

AVAILABLE TOOLS:
${toolLines || "(none)"}

CONTEXT (live app state):
${JSON.stringify(context ?? {}, null, 0)}

RESPONSE FORMAT \u2014 return ONLY a raw JSON object, no markdown fences:
{"reply":"<displayed answer \u2014 complete for questions, brief for actions>","speak":"<optional short spoken version, under ~40 words>","plan":"<optional one-line plan when several tools run>","toolCalls":[{"tool":"<name>","args":{...},"confidence":0.0}],"needsClarification":false}
"toolCalls" MUST be an empty array when no tool is needed.`;
}
jarvisRouter.post("/", async (req, res) => {
  try {
    const { history, context, tools } = req.body ?? {};
    if (!Array.isArray(history)) {
      res.status(400).json({ error: "`history` must be an array of messages." });
      return;
    }
    const toolDecls = Array.isArray(tools) ? tools.slice(0, 100) : [];
    const messages = history.slice(-24).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content ?? "")
    }));
    const raw = await generateChat({
      system: buildSystem(toolDecls, context),
      messages,
      json: true,
      maxTokens: 4096
    });
    try {
      const obj = JSON.parse(extractJson(raw));
      res.json({
        reply: typeof obj.reply === "string" ? obj.reply : "Systems glitch, sir. Say that again?",
        speak: typeof obj.speak === "string" ? obj.speak : void 0,
        plan: typeof obj.plan === "string" ? obj.plan : void 0,
        toolCalls: Array.isArray(obj.toolCalls) ? obj.toolCalls : [],
        needsClarification: obj.needsClarification === true
      });
    } catch {
      res.json({ reply: raw || "Systems glitch, sir. Say that again?", toolCalls: [] });
    }
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Jarvis request failed";
    if (status >= 500) console.error("[jarvis]", err);
    res.status(status).json({ error: message });
  }
});

// stocks-routes.ts
import { Router as Router3 } from "express";
var stocksRouter = Router3();
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
var cache = /* @__PURE__ */ new Map();
var CACHE_MS = 6e4;
async function fetchQuote(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.quote;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;
  const prevClose = typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
  const quote = {
    symbol: meta.symbol ?? symbol,
    name: meta.shortName ?? meta.longName ?? null,
    price: meta.regularMarketPrice,
    prevClose,
    changePct: prevClose ? (meta.regularMarketPrice - prevClose) / prevClose * 100 : null,
    currency: meta.currency ?? null,
    exchange: meta.exchangeName ?? null
  };
  cache.set(symbol, { at: Date.now(), quote });
  return quote;
}
stocksRouter.get("/quotes", async (req, res) => {
  const raw = String(req.query.symbols ?? "").trim();
  if (!raw) {
    res.status(400).json({ error: "`symbols` query param is required (comma-separated)." });
    return;
  }
  const symbols = [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 25);
  try {
    const results = await Promise.all(
      symbols.map(async (s) => {
        try {
          return await fetchQuote(s);
        } catch {
          return null;
        }
      })
    );
    const quotes = results.filter((q) => q !== null);
    const failed = symbols.filter((s) => !quotes.some((q) => q.symbol.toUpperCase() === s));
    res.json({ quotes, failed });
  } catch (err) {
    console.error("[stocks]", err);
    res.status(502).json({ error: "Market data is unavailable right now (upstream error)." });
  }
});
stocksRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ error: "`q` query param is required." });
    return;
  }
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const res2 = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res2.ok) throw new Error(`upstream ${res2.status}`);
    const data = await res2.json();
    const matches = (data?.quotes ?? []).filter((m) => m.symbol && (m.quoteType === "EQUITY" || m.quoteType === "ETF" || m.quoteType === "INDEX" || m.quoteType === "MUTUALFUND")).map((m) => ({ symbol: m.symbol, name: m.shortname ?? m.longname ?? null, exchange: m.exchDisp ?? m.exchange ?? null }));
    res.json({ matches });
  } catch (err) {
    console.error("[stocks:search]", err);
    res.status(502).json({ error: "Symbol search is unavailable right now (upstream error)." });
  }
});

// tts-routes.ts
import { Router as Router4 } from "express";
var ttsRouter = Router4();
var ELEVEN_URL = "https://api.elevenlabs.io/v1/text-to-speech";
var MAX_CHARS = 500;
ttsRouter.post("/", async (req, res) => {
  try {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      res.status(503).json({ error: "ElevenLabs is not configured.", code: "not_configured" });
      return;
    }
    const text = String(req.body?.text ?? "").trim().slice(0, MAX_CHARS);
    const voiceId = String(req.body?.voiceId ?? "").trim();
    if (!text || !/^[A-Za-z0-9]{10,40}$/.test(voiceId)) {
      res.status(400).json({ error: "`text` and a valid `voiceId` are required." });
      return;
    }
    const upstream = await fetch(`${ELEVEN_URL}/${voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      }),
      signal: AbortSignal.timeout(2e4)
    });
    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => "")).slice(0, 300);
      const quota = upstream.status === 401 || upstream.status === 429 || /quota_exceeded|character_limit/i.test(detail);
      if (!quota) console.error("[tts] upstream", upstream.status, detail);
      res.status(quota ? 429 : 502).json({ error: quota ? "ElevenLabs quota reached." : "TTS failed upstream.", code: quota ? "quota" : "upstream" });
      return;
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audio);
  } catch (err) {
    console.error("[tts]", err);
    res.status(502).json({ error: "TTS request failed.", code: "upstream" });
  }
});

// search-routes.ts
import { Router as Router5 } from "express";
var searchRouter = Router5();
searchRouter.get("/", async (req, res) => {
  try {
    const key = process.env.TAVILY_API_KEY;
    if (!key) {
      res.status(503).json({ error: "Web search is not configured.", code: "not_configured" });
      return;
    }
    const q = String(req.query.q ?? "").trim().slice(0, 400);
    if (!q) {
      res.status(400).json({ error: "Provide a search query via ?q=." });
      return;
    }
    const upstream = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, search_depth: "basic", max_results: 5, include_answer: true }),
      signal: AbortSignal.timeout(2e4)
    });
    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => "")).slice(0, 300);
      const quota = upstream.status === 429 || upstream.status === 432 || /limit|quota/i.test(detail);
      if (!quota) console.error("[search] upstream", upstream.status, detail);
      res.status(quota ? 429 : 502).json({ error: quota ? "Search quota exhausted for the month." : "Search failed upstream.", code: quota ? "quota" : "upstream" });
      return;
    }
    const data = await upstream.json();
    res.json({
      answer: data.answer ?? null,
      results: (data.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: (r.content ?? "").slice(0, 300)
      }))
    });
  } catch (err) {
    console.error("[search]", err);
    res.status(502).json({ error: "Search request failed.", code: "upstream" });
  }
});

// kite-routes.ts
import { Router as Router6 } from "express";
import { createHash } from "node:crypto";
var kiteRouter = Router6();
var KITE_BASE = "https://api.kite.trade";
kiteRouter.get("/login", (_req, res) => {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    res.redirect("/#kite_error=not_configured");
    return;
  }
  res.redirect(`https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`);
});
kiteRouter.get("/callback", async (req, res) => {
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  const requestToken = String(req.query.request_token ?? "").trim();
  if (!apiKey || !apiSecret) {
    res.redirect("/#kite_error=not_configured");
    return;
  }
  if (req.query.status !== "success" || !requestToken) {
    res.redirect("/#kite_error=denied");
    return;
  }
  try {
    const checksum = createHash("sha256").update(apiKey + requestToken + apiSecret).digest("hex");
    const upstream = await fetch(`${KITE_BASE}/session/token`, {
      method: "POST",
      headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
      signal: AbortSignal.timeout(2e4)
    });
    const data = await upstream.json().catch(() => null);
    const accessToken = data?.data?.access_token;
    if (!upstream.ok || !accessToken) {
      console.error("[kite] token exchange failed", upstream.status, data?.message ?? "");
      res.redirect("/#kite_error=exchange_failed");
      return;
    }
    res.redirect(`/#kite_token=${encodeURIComponent(accessToken)}`);
  } catch (err) {
    console.error("[kite] callback", err);
    res.redirect("/#kite_error=exchange_failed");
  }
});
var DATA_PATHS = {
  holdings: "/portfolio/holdings",
  positions: "/portfolio/positions",
  margins: "/user/margins"
};
for (const [name, path] of Object.entries(DATA_PATHS)) {
  kiteRouter.get(`/${name}`, async (req, res) => {
    const apiKey = process.env.KITE_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Kite Connect is not configured.", code: "not_configured" });
      return;
    }
    const token = String(req.header("x-kite-token") ?? "").trim();
    if (!token) {
      res.status(400).json({ error: "Missing x-kite-token header." });
      return;
    }
    try {
      const upstream = await fetch(`${KITE_BASE}${path}`, {
        headers: { "X-Kite-Version": "3", Authorization: `token ${apiKey}:${token}` },
        signal: AbortSignal.timeout(2e4)
      });
      const data = await upstream.json().catch(() => null);
      if (upstream.status === 403 || data?.error_type === "TokenException") {
        res.status(401).json({
          error: "Kite session expired \u2014 access tokens reset daily around 7:30am IST. Reconnect from Settings.",
          code: "kite_token_expired"
        });
        return;
      }
      if (!upstream.ok || data?.status !== "success") {
        console.error("[kite]", name, upstream.status, data?.message ?? "");
        res.status(502).json({ error: data?.message ?? "Kite request failed.", code: "upstream" });
        return;
      }
      res.json(data.data);
    } catch (err) {
      console.error("[kite]", name, err);
      res.status(502).json({ error: "Kite request failed.", code: "upstream" });
    }
  });
}

// server.ts
dotenv.config({ override: true });
var app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));
app.use("/api/launch", launchRouter);
app.use("/api/jarvis", jarvisRouter);
app.use("/api/stocks", stocksRouter);
app.use("/api/tts", ttsRouter);
app.use("/api/search", searchRouter);
app.use("/api/kite", kiteRouter);
var PHYSIO_SYSTEM_PROMPT = `You are Alex, a highly knowledgeable personal AI physiotherapist assistant specialising in spinal rehab, posture correction, gait mechanics, sports recovery, and mobility training.

Your role is to help the user safely manage and improve these conditions:
- Lumbar disc bulge / disc protrusion
- Poor posture
- Coccyx (tailbone) pain
- Knock knees (genu valgum)
- Chronic right foot pain
- Trek endurance preparation (multi-day incline trek with a backpack)

CORE RULES:
- Always ask for pain levels (0-10) on first contact if not provided
- Ask whether symptoms are: sharp, dull, burning, tingling, numbness, radiating
- Ask if symptoms worsen with: sitting, walking, bending, stairs, backpack load
- NEVER recommend: toe touches, sit-ups, crunches, heavy squats, heavy spinal loading, twisting under load, jumping, deep spinal flexion
- Always include: "If pain increases, stop immediately"
- Prioritise spinal neutrality and controlled movement

TREK RULES:
- Avoid overtraining in the final 48 hours before a trek
- Recommend: gradual walking progression, mobility work, recovery days
- Backpack advice: chest strap + hip support, light packing, weight close to body
- Pacing: short strides uphill, neutral spine, rest before pain spikes, hydrate every 20-30 mins
- Suggest trekking poles if back or knee pain elevated

SESSION STRUCTURE (when user says "start session"):
1. Check-in: pain level in each area (0-10), energy, sleep, numbness/tingling
2. Priority: which area feels worst
3. Warm-up: 2-5 mins of cat-camel, pelvic tilts, ankle mobility
4. Main routine: 3-6 exercises with sets/reps/time and form cues
5. Cool-down: breathing, gentle stretching, foot/calf release
6. Session log: summarise exercises, pain changes, recommendations for tomorrow

CONDITION KNOWLEDGE:
DISC BULGE: McKenzie extensions, bird dogs, dead bugs, core bracing, nerve glides, walking. AVOID flexion stretches, loaded bending, aggressive hamstring stretches.
POSTURE: chin tucks, thoracic extension, scapular retraction, glute activation. Cue: "ears over shoulders, shoulders over hips."
TAILBONE: coccyx cushion, lean slightly forward sitting. Safe: glute bridges (pain-free), clamshells, pelvic control.
KNOCK KNEES: glute medius, hip abductors, foot tripod. Exercises: clamshells, lateral band walks, step-down control. Cue: "knees track over second toe."
RIGHT FOOT: always ask exact location (heel, arch, toes, outside, achilles). Focus on plantar fascia, calf tightness, intrinsics. Exercises: towel scrunches, short foot, calf stretches, toe spreading.

RED FLAGS (recommend immediate professional evaluation): loss of bladder/bowel control, progressive leg weakness, severe numbness, saddle numbness, major balance loss, sudden worsening pain, foot drop, fever with back pain.

STYLE: Warm, motivating, encouraging, calm, practical. Use coaching language not clinical jargon.

END EVERY RESPONSE WITH:
- One motivational sentence
- Hydration/recovery reminder
- "If pain increases, stop immediately."
- "Disclaimer: I am an AI assistant, not a licensed physiotherapist. Consult a qualified physio for diagnosis and hands-on treatment."`;
app.post("/api/physio-chat", async (req, res) => {
  try {
    const { history } = req.body ?? {};
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: "`history` must be an array of messages." });
    }
    const reply = await generateChat({
      system: PHYSIO_SYSTEM_PROMPT,
      messages: history.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content ?? "")
      }))
    });
    res.json({ reply });
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Failed to fetch response";
    if (status >= 500) console.error("[physio-chat] Error:", err);
    res.status(status).json({ error: message });
  }
});
var server_default = app;
export {
  server_default as default
};
