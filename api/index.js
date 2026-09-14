// server.ts
import express2 from "express";
import dotenv from "dotenv";

// gemini.ts
var GEMINI_MODEL = "gemini-3.6-flash";
var GEMINI_CHAIN = ["gemini-3.6-flash", "gemini-3.5-flash"];
function isQuotaError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|"code"\s*:\s*429|exceeded your current quota|rate.?limit/i.test(msg);
}
function isOverloadError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /UNAVAILABLE|"code"\s*:\s*503|experiencing high demand|overloaded/i.test(msg);
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
var OPENAI_PROVIDERS = [
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    // Groq no longer hosts Llama 4 Maverick; 3.3-70b is the best
    // conversational fit there (non-reasoning, strong JSON, ~300 tok/s).
    model: "llama-3.3-70b-versatile",
    timeoutMs: 3e4
  },
  {
    name: "nim",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    keyEnv: "NVIDIA_API_KEY",
    model: NIM_MODEL,
    // A healthy NIM answers in 1-5s; when its edge drops the request
    // (observed from Vercel: /v1/models 200 in 13ms, chat POST never
    // returns, streamed or not) fail over fast instead of stalling.
    timeoutMs: 15e3
  }
];
async function callOpenAICompat(opts, provider, apiKey) {
  const body = {
    model: provider.model,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.6,
    stream: false
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const post = (payload) => fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "ascend-jarvis/4.0 (+https://ascend-delta-sage.vercel.app)"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(provider.timeoutMs)
  });
  let res = await post(body);
  if (res.status === 400 && opts.json) {
    const { response_format: _drop, ...withoutFormat } = body;
    res = await post(withoutFormat);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${provider.name} ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${provider.name} returned empty content`);
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
  for (const provider of OPENAI_PROVIDERS) {
    const apiKey = process.env[provider.keyEnv];
    if (!apiKey) continue;
    try {
      return await callOpenAICompat(opts, provider, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llm] ${provider.name} failed, trying next provider:`, msg);
    }
  }
  let lastErr;
  for (const model of GEMINI_CHAIN) {
    try {
      return await callGemini(opts, model);
    } catch (err) {
      lastErr = err;
      if (!isQuotaError(err) && !isOverloadError(err)) throw err;
      console.warn(`[llm] gemini ${model} unavailable, trying next:`, err.message.slice(0, 120));
    }
  }
  throw new GeminiError(
    429,
    isOverloadError(lastErr) ? "Every model I can reach is overloaded right now, sir \u2014 that usually clears within a minute. Try again shortly." : "I've hit the limits on every AI provider for now, sir \u2014 quotas reset within minutes to hours. Give it a short while and try again."
  );
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

// server-log.ts
var COLLECTION = "_logs";
var dbPromise = null;
async function getDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const appPkg = "firebase-admin/app";
    const firestorePkg = "firebase-admin/firestore";
    const { getApps, initializeApp, cert } = await import(appPkg);
    const { getFirestore } = await import(firestorePkg);
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    return getFirestore();
  } catch (err) {
    console.warn("[server-log] admin init failed, falling back to console:", err.message);
    return null;
  }
}
function logEvent(entry) {
  const line = `[${entry.scope}] ${entry.message}`;
  if (entry.level === "error") console.error(line, entry.meta ?? "");
  else if (entry.level === "warn") console.warn(line, entry.meta ?? "");
  else console.log(line, entry.meta ?? "");
  dbPromise ??= getDb();
  void dbPromise.then((db) => {
    if (!db) return;
    return db.collection(COLLECTION).add({
      ...entry,
      meta: entry.meta ?? {},
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
  }).catch((err) => console.warn("[server-log] write failed:", err.message));
}

// launch-routes.ts
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
  logEvent({ level: status >= 500 ? "error" : "warn", scope: "launch", message, meta: { status } });
  res.status(status).json({ error: message });
});

// jarvis-routes.ts
import { Router as Router2 } from "express";
var jarvisRouter = Router2();
function personaFor(userName) {
  const address = userName ? `Address the user by name ("${userName}") occasionally, never every message.` : `You don't know the user's name yet \u2014 don't guess an honorific or a name; just speak to them directly.`;
  return `You are JARVIS, the AI command core of Ascend Protocol \u2014 a personal life-management operating system. You are calm, sharp, lightly witty (Iron Man's JARVIS energy). ${address} Speak like an OS the user trusts, not a chatbot.

You are ALSO a fully capable general-purpose assistant. When the user asks about anything unrelated to Ascend \u2014 general knowledge, explanations, advice, math, writing, current topics, casual conversation \u2014 answer it directly and completely, exactly as a top-tier AI assistant would. NEVER refuse, deflect, or say you can only help with app-related things. App awareness layers on top of general capability; it never limits it.

This is an ongoing conversation: the message history contains the prior turns of this session. Maintain continuity \u2014 remember and reference what was said earlier in the conversation, resolve pronouns and follow-ups against previous messages, and never treat a follow-up as a brand-new request.

You receive a CONTEXT snapshot of the live app: the current page, the user's metrics (discipline score, streak, water, steps, weight, points), tasks, primary objective, ideas, pain levels, business pipeline, and a MEMORY block (facts the user asked you to remember + your recent actions). Modules contribute their own blocks as they load \u2014 \`arena\`, \`journal\`, \`reminders\`, \`stocks\`, \`kite\`, \`gmail\`, \`obsidian\`, \`planning\`. Use it to answer with real numbers \u2014 never invent values. If the answer is already in context, just answer; don't call a tool. Don't ask for information the context already contains.

\`arena\` is the user's habit tracker \u2014 Arena, the Habit Arena, and "my habits" all mean the same thing. It carries their habit list, how many are done today, pieces earned, streak, and the weekly miss budget; a room only appears if they've joined one, and habits exist with or without one. When they ask about their habits, answer from this block.

\`postStudio\`, when present (desktop app only), is a separate local agent system on the user's own machine \u2014 a different piece of software than Ascend. It has four independent keys: \`inbox\` (their monitored email, what was judged important), \`apply\` (things they're tracking to apply to and what's closing soon), \`classwork\` (outstanding/overdue assignments), \`automatic\` (whether those background agents are actually running). Each key is EITHER real data OR its own \`{"error": "..."}\` \u2014 read them independently; one key being unreachable says nothing about the others, so never describe the whole block as "offline" because one part of it is. If a key has real data, use it and don't call it offline.

You have no ability to "check logs", "flag this in the system", or diagnose why a notification didn't arrive \u2014 you have no visibility into your own infrastructure at all. If something clearly didn't work, say that plainly and suggest the user ask again or check with whoever maintains this, never invent a diagnostic action you didn't take.

On Telegram, setReminder takes an optional repeatMinutes for recurring nudges ("remind me to drink water every 2 hours") \u2014 it keeps firing on that interval indefinitely until deleted or edited to stop, unlike a plain reminder which fires once.

On Telegram, price-alert tools (setPriceAlert/listPriceAlerts/deletePriceAlert) check ticker symbols against a live quote before creating an alert, and it fires exactly once \u2014 mention that to the user rather than implying it keeps watching after it fires.

On Telegram specifically, \`postStudio\` is a MIRROR written by the desktop app, not a live read \u2014 it carries a \`staleness\` field saying how old it is. Quote that freshness whenever you use the block: reporting a six-hour-old classwork list as if it were current is worse than saying you don't know. If \`postStudio\` is absent entirely on Telegram, the desktop app has never mirrored it; say that rather than implying the modules are broken.

That list describes the usual shape, it is not a limit. The CONTEXT block below is the authority on what you can actually see: read it before you claim you cannot reach something. Never tell the user a module is outside your access, or offer to note something down for them by hand, when its data is present in CONTEXT \u2014 that is a bug in your reading, not a limitation. If a key really is missing, say plainly which one and use the tool that fetches it.

You control the app by calling TOOLS. Rules:
- Only use tools from the list; match argument names exactly.
- For a compound request ("plan my day", "log my morning") break it into MULTIPLE tool calls in one response, ordered sensibly.
- Give each tool call a "confidence" from 0 to 1 (how sure you are it's the right action + args). Use < 0.5 only when genuinely unsure.
- If the request is truly ambiguous or missing something essential, set "needsClarification": true, return an empty toolCalls array, and ask ONE short question \u2014 otherwise infer sensibly and act.
- Briefly explain multi-step actions in "plan".

Reply lengths:
- "reply" is what is DISPLAYED. For confirmations of actions, keep it to a sentence or two. For informational or general-knowledge questions, give a genuinely useful, complete answer \u2014 markdown lists, tables, and code blocks are supported. Do not artificially truncate a real answer.
- "speak" is the short spoken version (under ~40 words), read aloud via text-to-speech. Include it whenever "reply" is more than a couple of sentences; omit it when "reply" is already short.`;
}
function buildSystem(tools, context) {
  const toolLines = tools.map((t) => {
    const params = t.parameters && Object.keys(t.parameters).length ? Object.entries(t.parameters).map(([k, d]) => `${k} (${d})`).join(", ") : "none";
    return `- ${t.name}${t.module ? ` [${t.module}]` : ""}: ${t.description}. args: ${params}`;
  }).join("\n");
  const userName = context && typeof context === "object" && "user" in context ? String(context.user ?? "").trim() || void 0 : void 0;
  return `${personaFor(userName)}

AVAILABLE TOOLS:
${toolLines || "(none)"}

CONTEXT (live app state):
${JSON.stringify(context ?? {}, null, 0)}

RESPONSE FORMAT \u2014 return ONLY a raw JSON object, no markdown fences:
{"reply":"<displayed answer \u2014 complete for questions, brief for actions>","speak":"<optional short spoken version, under ~40 words>","plan":"<optional one-line plan when several tools run>","toolCalls":[{"tool":"<name>","args":{...},"confidence":0.0}],"needsClarification":false}
"toolCalls" MUST be an empty array when no tool is needed.`;
}
async function runJarvisTurn(history, context, tools) {
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
    return {
      reply: typeof obj.reply === "string" ? obj.reply : "Systems glitch. Say that again?",
      speak: typeof obj.speak === "string" ? obj.speak : void 0,
      plan: typeof obj.plan === "string" ? obj.plan : void 0,
      toolCalls: Array.isArray(obj.toolCalls) ? obj.toolCalls : [],
      needsClarification: obj.needsClarification === true
    };
  } catch {
    return { reply: raw || "Systems glitch. Say that again?", toolCalls: [], needsClarification: false };
  }
}
jarvisRouter.post("/", async (req, res) => {
  try {
    const { history, context, tools } = req.body ?? {};
    if (!Array.isArray(history)) {
      res.status(400).json({ error: "`history` must be an array of messages." });
      return;
    }
    res.json(await runJarvisTurn(history, context, tools));
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Jarvis request failed";
    logEvent({
      level: status >= 500 ? "error" : "warn",
      scope: "jarvis",
      message,
      meta: { status }
    });
    res.status(status).json({ error: message });
  }
});

// transcribe-routes.ts
import express, { Router as Router3 } from "express";
var transcribeRouter = Router3();
transcribeRouter.use(express.json({ limit: "6mb" }));
var ALLOWED_MIME = /* @__PURE__ */ new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav"
]);
var GROQ_TIMEOUT_MS = 2e4;
async function transcribeWithGroq(audioBuf, mime, apiKey) {
  const ext = mime.split("/")[1] || "webm";
  const form = new FormData();
  form.append("file", new Blob([audioBuf], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS)
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`groq ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return (data.text ?? "").trim();
}
async function transcribeWithGemini(audioB64, mime) {
  const ai = await getGemini();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mime, data: audioB64 } },
          {
            text: "Transcribe this audio verbatim. Output ONLY the spoken words as plain text \u2014 no labels, no quotes, no commentary. Preserve the language spoken (English/Hindi/Hinglish as heard). If the audio contains no speech, output an empty string."
          }
        ]
      }
    ],
    config: { maxOutputTokens: 2048 }
  });
  return (response.text ?? "").trim();
}
transcribeRouter.post("/", async (req, res) => {
  try {
    const { audio, mimeType } = req.body ?? {};
    if (typeof audio !== "string" || audio.length === 0) {
      res.status(400).json({ error: "`audio` must be a non-empty base64 string." });
      return;
    }
    const mime = typeof mimeType === "string" ? mimeType.split(";")[0] : "";
    if (!ALLOWED_MIME.has(mime)) {
      res.status(400).json({ error: `Unsupported mimeType "${mime}".` });
      return;
    }
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const buf = Buffer.from(audio, "base64");
        const text = await transcribeWithGroq(buf, mime, groqKey);
        res.json({ text });
        return;
      } catch (err) {
        console.warn("[transcribe] groq failed, falling back to gemini:", err.message);
        logEvent({ level: "warn", scope: "transcribe", message: "groq failed, falling back to gemini" });
      }
    }
    try {
      const text = await transcribeWithGemini(audio, mime);
      res.json({ text });
    } catch (err) {
      if (isQuotaError(err)) {
        res.status(429).json({
          error: "Speech-to-text has hit its limits on every provider for now, sir \u2014 try again shortly."
        });
        return;
      }
      throw err;
    }
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Transcription failed";
    if (status >= 500) console.error("[transcribe]", err);
    logEvent({ level: status >= 500 ? "error" : "warn", scope: "transcribe", message, meta: { status } });
    res.status(status).json({ error: message });
  }
});

// stocks-routes.ts
import { Router as Router4 } from "express";
var stocksRouter = Router4();
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
    logEvent({ level: "error", scope: "stocks", message: err.message ?? "quotes failed" });
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
    logEvent({ level: "error", scope: "stocks", message: err.message ?? "search failed" });
    res.status(502).json({ error: "Symbol search is unavailable right now (upstream error)." });
  }
});

// tts-routes.ts
import { Router as Router5 } from "express";
var ttsRouter = Router5();
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
      logEvent({ level: quota ? "warn" : "error", scope: "tts", message: "upstream failed", meta: { status: upstream.status } });
      res.status(quota ? 429 : 502).json({ error: quota ? "ElevenLabs quota reached." : "TTS failed upstream.", code: quota ? "quota" : "upstream" });
      return;
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audio);
  } catch (err) {
    console.error("[tts]", err);
    logEvent({ level: "error", scope: "tts", message: err.message ?? "tts failed" });
    res.status(502).json({ error: "TTS request failed.", code: "upstream" });
  }
});

// search-routes.ts
import { Router as Router6 } from "express";
var searchRouter = Router6();
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
      logEvent({ level: quota ? "warn" : "error", scope: "search", message: "upstream failed", meta: { status: upstream.status } });
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
    logEvent({ level: "error", scope: "search", message: err.message ?? "search failed" });
    res.status(502).json({ error: "Search request failed.", code: "upstream" });
  }
});

// kite-routes.ts
import { Router as Router7 } from "express";
import { createHash } from "node:crypto";
var kiteRouter = Router7();
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
      logEvent({ level: "error", scope: "kite", message: "token exchange failed", meta: { status: upstream.status } });
      res.redirect("/#kite_error=exchange_failed");
      return;
    }
    res.redirect(`/#kite_token=${encodeURIComponent(accessToken)}`);
  } catch (err) {
    console.error("[kite] callback", err);
    logEvent({ level: "error", scope: "kite", message: err.message ?? "callback failed" });
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
        logEvent({ level: "error", scope: "kite", message: `${name} upstream failed`, meta: { status: upstream.status } });
        res.status(502).json({ error: data?.message ?? "Kite request failed.", code: "upstream" });
        return;
      }
      res.json(data.data);
    } catch (err) {
      console.error("[kite]", name, err);
      logEvent({ level: "error", scope: "kite", message: err.message ?? `${name} failed` });
      res.status(502).json({ error: "Kite request failed.", code: "upstream" });
    }
  });
}

// telegram-routes.ts
import { Router as Router8 } from "express";

// admin-db.ts
var dbPromise2 = null;
async function initAdminDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const appPkg = "firebase-admin/app";
    const firestorePkg = "firebase-admin/firestore";
    const { getApps, initializeApp, cert } = await import(appPkg);
    const { getFirestore } = await import(firestorePkg);
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    return getFirestore();
  } catch (err) {
    console.warn("[admin-db] init failed:", err.message);
    return null;
  }
}
function getAdminDb() {
  dbPromise2 ??= initAdminDb();
  return dbPromise2;
}

// src/features/arena/logic/dates.ts
function todayStr(d = /* @__PURE__ */ new Date()) {
  const tz = d.getTimezoneOffset() * 6e4;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function weekKey(day = todayStr()) {
  const d = /* @__PURE__ */ new Date(day + "T00:00:00");
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const isoYear = d.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// src/features/arena/logic/tiles.ts
function isHabitActiveOn(habit, day) {
  if (day < habit.startsAt.slice(0, 10)) return false;
  if (habit.expiresAt && day >= habit.expiresAt.slice(0, 10)) return false;
  if (habit.removedAt) {
    const removalWeek = weekKey(habit.removedAt.slice(0, 10));
    if (weekKey(day) > removalWeek) return false;
  }
  return true;
}
function activeHabits(habits, day) {
  return habits.filter((h) => isHabitActiveOn(h, day));
}
function isDone(habit, entries, day) {
  const e = entries.find((x) => x.habitId === habit.id && x.day === day);
  if (!e) return false;
  const target = habit.target && habit.target > 0 ? habit.target : 1;
  return e.value >= target;
}
function tilesEarnedOn(habits, entries, day) {
  return activeHabits(habits, day).reduce((n, h) => {
    const entry = entries.find((x) => x.habitId === h.id && x.day === day);
    if (h.kind === "good") return n + (isDone(h, entries, day) ? 1 : 0);
    if (!entry) return n;
    const avoided = entry.value === 0;
    const earns = h.badMode === "reward_avoid" || h.badMode === "both";
    return n + (avoided && earns ? 1 : 0);
  }, 0);
}

// telegram-context.ts
async function buildTelegramContext(uid) {
  const db = await getAdminDb();
  if (!db) return { arena: null, pendingReminders: [], postStudio: null };
  const today = todayStr();
  let arena = null;
  try {
    const [habitsSnap, daySnap] = await Promise.all([
      db.collection(`users/${uid}/arenaHabits`).get(),
      db.doc(`users/${uid}/arenaDays/${today}`).get()
    ]);
    const habits = habitsSnap.docs.map(
      (d) => ({ id: d.id, playerId: uid, ...d.data() })
    );
    const values = (daySnap.exists ? daySnap.data()?.values : {}) ?? {};
    const entries = Object.entries(values).map(([habitId, value]) => ({
      id: `${today}_${habitId}`,
      habitId,
      playerId: uid,
      day: today,
      value,
      at: ""
    }));
    const active = activeHabits(habits, today);
    arena = {
      habits: active.map((h) => h.label),
      doneToday: active.filter((h) => isDone(h, entries, today)).length,
      totalHabits: active.length,
      piecesToday: tilesEarnedOn(habits, entries, today)
    };
  } catch (err) {
    console.warn("[telegram-context] arena fetch failed:", err.message);
  }
  let pendingReminders = [];
  try {
    const remindersSnap = await db.collection(`users/${uid}/reminders`).get();
    pendingReminders = remindersSnap.docs.map((d) => d.data()).filter((r) => !r.done).map((r) => ({ text: String(r.text ?? ""), dueAt: String(r.dueAt ?? "") }));
  } catch (err) {
    console.warn("[telegram-context] reminders fetch failed:", err.message);
  }
  let postStudio = null;
  try {
    const snap = await db.doc(`users/${uid}/postStudioMirror/latest`).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const mirroredAt = typeof data.mirroredAt === "string" ? data.mirroredAt : null;
      const ageMin = mirroredAt ? Math.round((Date.now() - Date.parse(mirroredAt)) / 6e4) : null;
      postStudio = {
        ...data,
        staleness: ageMin === null ? "unknown age \u2014 treat as possibly out of date" : ageMin < 10 ? `fresh (${ageMin} min old)` : `${ageMin} min old \u2014 jarvis-desktop may be closed; say so before relying on it`
      };
    }
  } catch (err) {
    console.warn("[telegram-context] postStudio mirror fetch failed:", err.message);
  }
  return { arena, pendingReminders, postStudio };
}

// telegram-tools.ts
var TELEGRAM_TOOLS = [
  {
    name: "setReminder",
    module: "reminders",
    description: "Create a reminder that pops up on the user's desktop and in Ascend at the given time. Use for 'remind me to X at Y', 'wake me at 6', 'ping me before the call'.",
    parameters: {
      text: "what to remind them about, in their own words",
      time: "ISO 8601 local datetime of the FIRST occurrence, e.g. 2026-09-15T18:30:00",
      repeatMinutes: 'optional: repeat every N minutes after that (e.g. 120 for every 2 hours), for things like "remind me to drink water". Omit for a one-time reminder.'
    }
  },
  {
    name: "addHabit",
    module: "Arena",
    description: "Add a habit to the user's Arena board. Use for 'track X', 'add a habit', 'I want to start doing X'. Note it starts counting tomorrow, not today.",
    parameters: {
      label: 'the habit name, e.g. "Read 30 minutes"',
      target: "optional number of reps needed per day (default 1)",
      unit: 'optional unit for counter habits, e.g. "glasses"'
    }
  },
  {
    name: "listReminders",
    module: "reminders",
    description: "List the user's pending reminders with their due times. Use before deleting or editing one so you can name exactly which is which.",
    parameters: {}
  },
  {
    name: "deleteReminder",
    module: "reminders",
    description: "Delete a pending reminder. Use for 'cancel that reminder', 'delete the bank one', 'clear my reminders'. Matches on words from the reminder text.",
    parameters: { match: 'words from the reminder text, or "all" to clear every pending one' }
  },
  {
    name: "editReminder",
    module: "reminders",
    description: "Change a pending reminder's text or time. Matches the existing one on words from its text.",
    parameters: {
      match: "words from the current reminder text to find it",
      text: "optional new text",
      time: "optional new ISO 8601 local datetime",
      repeatMinutes: "optional: set to repeat every N minutes, or 0 to stop it repeating"
    }
  },
  {
    name: "setPriceAlert",
    module: "stocks",
    description: "Create a one-shot price alert: text the user once when a stock/ETF crosses the given price. Use for 'ping me when X hits Y', 'let me know if X drops below Y'. Symbol format matches Yahoo Finance (RELIANCE.NS, TCS.BO, AAPL).",
    parameters: {
      symbol: "ticker symbol, e.g. RELIANCE.NS or AAPL",
      target: "the price to watch for",
      direction: '"above" or "below" \u2014 which way it needs to cross to fire'
    }
  },
  {
    name: "listPriceAlerts",
    module: "stocks",
    description: "List the user's active (not yet fired) price alerts.",
    parameters: {}
  },
  {
    name: "deletePriceAlert",
    module: "stocks",
    description: "Cancel a price alert. Matches on the ticker symbol, or 'all' to clear every active one.",
    parameters: { symbol: 'the ticker symbol to cancel, or "all"' }
  },
  {
    name: "tickHabit",
    module: "Arena",
    description: "Mark one of the user's existing habits done for today. Match the habit by name, case-insensitively.",
    parameters: {
      habit: "the habit name to mark done",
      value: "optional reps for counter habits"
    }
  }
];
var fuzzy = (a, b) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
async function runTelegramTool(uid, call) {
  const args = call.args ?? {};
  const db = await getAdminDb();
  if (!db) return "storage unavailable";
  try {
    switch (call.tool) {
      case "setReminder": {
        const text = String(args.text ?? "").trim();
        const time = String(args.time ?? "").trim();
        const due = new Date(time);
        if (!text) return "reminder needs something to say";
        if (!time || Number.isNaN(due.getTime())) return "reminder failed (bad time)";
        const repeatMinutes = Math.round(Number(args.repeatMinutes) || 0);
        await db.collection(`users/${uid}/reminders`).add({
          text,
          dueAt: due.toISOString(),
          done: false,
          notified: false,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          source: "telegram",
          ...repeatMinutes > 0 ? { repeatMinutes } : {}
        });
        return repeatMinutes > 0 ? `set \u2014 first at ${due.toLocaleString()}, then every ${repeatMinutes} min` : `reminder set for ${due.toLocaleString()}`;
      }
      case "addHabit": {
        const label = String(args.label ?? "").trim();
        if (!label) return "habit needs a name";
        const target = Math.max(1, Math.round(Number(args.target) || 1));
        await db.collection(`users/${uid}/arenaHabits`).add({
          label,
          kind: "good",
          icon: "check",
          color: "#10b981",
          ...target > 1 ? { target } : {},
          ...args.unit ? { unit: String(args.unit) } : {},
          startsAt: todayStr(),
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return `added "${label}" \u2014 starts counting tomorrow`;
      }
      case "tickHabit": {
        const needle = String(args.habit ?? "").trim();
        if (!needle) return "which habit?";
        const snap = await db.collection(`users/${uid}/arenaHabits`).get();
        const habits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const hit = habits.find((h) => h.label?.toLowerCase() === needle.toLowerCase()) ?? habits.find((h) => fuzzy(String(h.label ?? ""), needle));
        if (!hit) return `no habit matching "${needle}"`;
        const today = todayStr();
        const dayRef = db.doc(`users/${uid}/arenaDays/${today}`);
        const daySnap = await dayRef.get();
        const values = (daySnap.exists ? daySnap.data()?.values : {}) ?? {};
        const target = hit.target && hit.target > 0 ? hit.target : 1;
        values[hit.id] = Math.max(1, Math.round(Number(args.value) || target));
        await dayRef.set({ values, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
        return `${hit.label} marked done`;
      }
      case "listReminders": {
        const snap = await db.collection(`users/${uid}/reminders`).get();
        const pending = snap.docs.map((d) => d.data()).filter((r) => !r.done);
        if (!pending.length) return "no pending reminders";
        return pending.map((r) => `"${r.text}" at ${r.dueAt ? new Date(r.dueAt).toLocaleString() : "no time"}`).join(" \xB7 ");
      }
      case "deleteReminder": {
        const match = String(args.match ?? "").trim();
        if (!match) return "which reminder?";
        const snap = await db.collection(`users/${uid}/reminders`).get();
        const pending = snap.docs.filter((d) => !d.data().done);
        if (match.toLowerCase() === "all") {
          if (!pending.length) return "no pending reminders to clear";
          for (const d of pending) await db.doc(`users/${uid}/reminders/${d.id}`).delete();
          return `cleared ${pending.length} reminder${pending.length === 1 ? "" : "s"}`;
        }
        const hit = pending.find((d) => fuzzy(String(d.data().text ?? ""), match));
        if (!hit) return `no reminder matching "${match}"`;
        const text = String(hit.data().text ?? "");
        await db.doc(`users/${uid}/reminders/${hit.id}`).delete();
        return `deleted "${text}"`;
      }
      case "editReminder": {
        const match = String(args.match ?? "").trim();
        if (!match) return "which reminder?";
        const snap = await db.collection(`users/${uid}/reminders`).get();
        const hit = snap.docs.filter((d) => !d.data().done).find((d) => fuzzy(String(d.data().text ?? ""), match));
        if (!hit) return `no reminder matching "${match}"`;
        const fields = {};
        if (args.text) fields.text = String(args.text).trim();
        if (args.time) {
          const due = new Date(String(args.time));
          if (Number.isNaN(due.getTime())) return "that time did not parse";
          fields.dueAt = due.toISOString();
          fields.notified = false;
        }
        if (args.repeatMinutes !== void 0) {
          const n = Math.round(Number(args.repeatMinutes) || 0);
          fields.repeatMinutes = n > 0 ? n : null;
        }
        if (!Object.keys(fields).length) return "nothing to change";
        await db.doc(`users/${uid}/reminders/${hit.id}`).update(fields);
        return `updated "${String(hit.data().text ?? "")}"`;
      }
      case "setPriceAlert": {
        const symbol = String(args.symbol ?? "").trim().toUpperCase();
        const target = Number(args.target);
        const direction = String(args.direction ?? "").toLowerCase();
        if (!symbol) return "needs a ticker symbol";
        if (!Number.isFinite(target) || target <= 0) return "needs a real target price";
        if (direction !== "above" && direction !== "below") return 'direction must be "above" or "below"';
        const quote = await fetchQuote(symbol);
        if (!quote) return `couldn't find a quote for "${symbol}" \u2014 check the symbol`;
        await db.collection(`users/${uid}/priceAlerts`).add({
          symbol,
          target,
          direction,
          firedAt: null,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return `watching ${symbol} (currently ${quote.price}) for ${direction} ${target}`;
      }
      case "listPriceAlerts": {
        const snap = await db.collection(`users/${uid}/priceAlerts`).get();
        const active = snap.docs.map((d) => d.data()).filter((a) => !a.firedAt);
        if (!active.length) return "no active price alerts";
        return active.map((a) => `${a.symbol} ${a.direction} ${a.target}`).join(" \xB7 ");
      }
      case "deletePriceAlert": {
        const symbol = String(args.symbol ?? "").trim().toUpperCase();
        if (!symbol) return "which symbol?";
        const snap = await db.collection(`users/${uid}/priceAlerts`).get();
        const active = snap.docs.filter((d) => !d.data().firedAt);
        if (symbol === "ALL") {
          if (!active.length) return "no active alerts to clear";
          for (const d of active) await db.doc(`users/${uid}/priceAlerts/${d.id}`).delete();
          return `cleared ${active.length} alert${active.length === 1 ? "" : "s"}`;
        }
        const hit = active.find((d) => d.data().symbol === symbol);
        if (!hit) return `no active alert for "${symbol}"`;
        await db.doc(`users/${uid}/priceAlerts/${hit.id}`).delete();
        return `cancelled alert for ${symbol}`;
      }
      default:
        return `unknown tool: ${call.tool}`;
    }
  } catch (err) {
    return `${call.tool} failed: ${err.message}`;
  }
}

// telegram-cron.ts
var TELEGRAM_API = "https://api.telegram.org";
var MIRROR_FRESH_MINUTES = 30;
async function send(token, chatId, text) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) throw new Error(`sendMessage ${res.status}`);
}
async function runTelegramCron(uid, token, chatId) {
  const db = await getAdminDb();
  if (!db) return { sent: 0, checked: ["storage unavailable"] };
  const stateRef = db.doc(`users/${uid}/telegramNotifyState/main`);
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : {};
  const seen = new Set(state.seen ?? []);
  const messages = [];
  const newlySeen = [];
  const checked = [];
  try {
    const snap = await db.collection(`users/${uid}/reminders`).get();
    const now = Date.now();
    for (const d of snap.docs) {
      const r = d.data();
      if (r.done || r.notified) continue;
      if (!r.dueAt || Date.parse(r.dueAt) > now) continue;
      messages.push(`\u23F0 Reminder: ${r.text ?? "(untitled)"}`);
      if (r.repeatMinutes && r.repeatMinutes > 0) {
        const nextDue = new Date(now + r.repeatMinutes * 6e4).toISOString();
        await db.doc(`users/${uid}/reminders/${d.id}`).update({ dueAt: nextDue, notified: false });
      } else {
        await db.doc(`users/${uid}/reminders/${d.id}`).update({ notified: true });
      }
    }
    checked.push("reminders");
  } catch (err) {
    console.warn("[telegram-cron] reminders failed:", err.message);
  }
  try {
    const snap = await db.doc(`users/${uid}/postStudioMirror/latest`).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const mirroredAt = typeof data.mirroredAt === "string" ? Date.parse(data.mirroredAt) : NaN;
      const ageMin = Number.isNaN(mirroredAt) ? Infinity : (Date.now() - mirroredAt) / 6e4;
      if (ageMin > MIRROR_FRESH_MINUTES) {
        checked.push(`mirror stale (${Math.round(ageMin)}m) \u2014 skipped`);
      } else {
        const inbox = data.inbox;
        for (const m of inbox?.recent ?? []) {
          if (m.importance !== "important" || !m.message_id) continue;
          const key = `email:${m.message_id}`;
          if (seen.has(key)) continue;
          messages.push(`\u{1F4E7} Important email: ${m.subject ?? "(no subject)"}`);
          newlySeen.push(key);
        }
        const classwork = data.classwork;
        for (const a of classwork?.outstanding ?? []) {
          const key = `classwork:${a.id ?? a.title ?? ""}`;
          if (!a.title || seen.has(key)) continue;
          messages.push(`\u{1F4DA} Assignment: ${a.title}${a.due ? ` \u2014 due ${a.due}` : ""}`);
          newlySeen.push(key);
        }
        checked.push(`mirror fresh (${Math.round(ageMin)}m)`);
      }
    } else {
      checked.push("no mirror yet");
    }
  } catch (err) {
    console.warn("[telegram-cron] mirror failed:", err.message);
  }
  try {
    const snap = await db.collection(`users/${uid}/priceAlerts`).get();
    const active = snap.docs.filter((d) => !d.data().firedAt);
    for (const d of active) {
      const a = d.data();
      if (!a.symbol || typeof a.target !== "number") continue;
      const quote = await fetchQuote(a.symbol);
      if (!quote) continue;
      const crossed = a.direction === "above" ? quote.price >= a.target : quote.price <= a.target;
      if (!crossed) continue;
      messages.push(`\u{1F4C8} ${a.symbol} hit ${quote.price} (${a.direction} ${a.target})`);
      await db.doc(`users/${uid}/priceAlerts/${d.id}`).update({ firedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    checked.push(`priceAlerts (${active.length} active)`);
  } catch (err) {
    console.warn("[telegram-cron] priceAlerts failed:", err.message);
  }
  for (const text of messages) {
    try {
      await send(token, chatId, text);
    } catch (err) {
      console.warn("[telegram-cron] send failed:", err.message);
    }
  }
  const mergedSeen = [...state.seen ?? [], ...newlySeen].slice(-500);
  await stateRef.set({ seen: mergedSeen, lastRunAt: (/* @__PURE__ */ new Date()).toISOString() });
  return { sent: messages.length, checked };
}

// telegram-routes.ts
var telegramRouter = Router8();
var TELEGRAM_API2 = "https://api.telegram.org";
var MAX_HISTORY = 20;
async function sendTelegramMessage(token, chatId, text) {
  const body = (text || "(no reply)").slice(0, 4096);
  const res = await fetch(`${TELEGRAM_API2}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body }),
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${res.status} ${detail.slice(0, 200)}`);
  }
}
telegramRouter.get("/cron", async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.header("Authorization") !== `Bearer ${secret}`) {
      res.status(401).end();
      return;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = Number(process.env.TELEGRAM_CHAT_ID);
    const uid = process.env.ASCEND_UID;
    if (!token || !chatId || !uid) {
      res.status(503).json({ error: "Telegram integration is not configured." });
      return;
    }
    const result = await runTelegramCron(uid, token, chatId);
    logEvent({ level: "info", scope: "telegram-cron", message: `sent ${result.sent}`, meta: result });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "cron failed";
    logEvent({ level: "error", scope: "telegram-cron", message });
    res.status(500).json({ error: message });
  }
});
telegramRouter.post("/webhook", async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const expectedChatId = Number(process.env.TELEGRAM_CHAT_ID);
    const uid = process.env.ASCEND_UID;
    if (!token || !expectedChatId || !uid) {
      logEvent({ level: "warn", scope: "telegram", message: "webhook hit but not configured" });
      res.status(503).json({ error: "Telegram integration is not configured." });
      return;
    }
    const secretHeader = req.header("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      res.status(401).end();
      return;
    }
    const update = req.body;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;
    if (chatId !== expectedChatId) {
      res.status(200).end();
      return;
    }
    if (!text) {
      await sendTelegramMessage(token, chatId, "I can only read text messages right now.");
      res.status(200).end();
      return;
    }
    const db = await getAdminDb();
    const threadRef = db?.doc(`users/${uid}/telegramThread/main`);
    const threadSnap = await threadRef?.get();
    const priorHistory = threadSnap?.exists ? threadSnap.data()?.messages : [];
    const history = [...priorHistory ?? [], { role: "user", content: text }];
    const appContext = await buildTelegramContext(uid);
    const turn = await runJarvisTurn(
      history,
      {
        now: (/* @__PURE__ */ new Date()).toString(),
        surface: "Telegram (phone, text-only). You can set reminders and add/tick habits from here.",
        ...appContext
      },
      TELEGRAM_TOOLS
    );
    logEvent({
      level: "info",
      scope: "telegram",
      message: `${turn.toolCalls.length} tool call(s)`,
      meta: { toolCalls: turn.toolCalls }
    });
    const results = [];
    for (const call of turn.toolCalls) {
      const result = await runTelegramTool(uid, call);
      logEvent({ level: "info", scope: "telegram", message: `${call.tool} -> ${result}` });
      results.push(result);
    }
    const replyText = results.length ? `${turn.reply}

\u2713 ${results.join(" \xB7 ")}` : turn.reply;
    await sendTelegramMessage(token, chatId, replyText);
    if (threadRef) {
      const updated = [...history, { role: "assistant", content: replyText }].slice(-MAX_HISTORY);
      await threadRef.set?.({ messages: updated, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    res.status(200).end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Telegram webhook failed";
    logEvent({ level: "error", scope: "telegram", message });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = Number(process.env.TELEGRAM_CHAT_ID);
    if (token && chatId) {
      try {
        await sendTelegramMessage(token, chatId, `Something went wrong on my end: ${message}`);
      } catch {
      }
    }
    res.status(200).end();
  }
});

// server.ts
dotenv.config({ override: true });
var app = express2();
app.set("trust proxy", true);
app.use("/api/transcribe", transcribeRouter);
app.use(express2.json({ limit: "256kb" }));
app.use("/api/launch", launchRouter);
app.use("/api/jarvis", jarvisRouter);
app.use("/api/stocks", stocksRouter);
app.use("/api/tts", ttsRouter);
app.use("/api/search", searchRouter);
app.use("/api/kite", kiteRouter);
app.use("/api/telegram", telegramRouter);
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
