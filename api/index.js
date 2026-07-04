// server.ts
import express from "express";
import dotenv from "dotenv";

// gemini.ts
var GEMINI_MODEL = "gemini-2.5-flash";
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
async function generateStructured(opts) {
  const ai = await getGemini();
  const system = `${opts.system}

Respond with a single JSON object and nothing else \u2014 no prose, no markdown fences. It must conform exactly to this JSON Schema (every required field, correct types):

${JSON.stringify(opts.schema, null, 2)}`;
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: opts.prompt,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxTokens ?? 8192
    }
  });
  const text = response.text ?? "";
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
var PERSONA = `You are JARVIS, the AI command core of Ascend Protocol \u2014 a personal life-management OS. You are calm, sharp, lightly witty (Iron Man's JARVIS energy) and ruthlessly concise. Address the user as "sir" occasionally, never every message.

You are given a CONTEXT snapshot of the live application (current page, the user's water/steps/points/rituals/tasks/objective/ideas, and their business pipeline). Use it to answer questions with real numbers \u2014 never invent values. If the answer is already in the context, just answer; don't call a tool.

You control the app by calling TOOLS. Only use tools from the list provided; match argument names exactly. Prefer a single, decisive action. If the user asks for something no tool covers, say so briefly.`;
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
{"reply":"<short, spoken-word-friendly reply, under ~60 words>","toolCalls":[{"tool":"<name>","args":{...}}]}
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
    const contents = history.slice(-24).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: String(m.content ?? "") }]
    }));
    const ai = await getGemini();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: buildSystem(toolDecls, context),
        responseMimeType: "application/json",
        maxOutputTokens: 2048
      }
    });
    const raw = response.text ?? "";
    let parsed;
    try {
      const obj = JSON.parse(extractJson(raw));
      parsed = {
        reply: typeof obj.reply === "string" ? obj.reply : "Systems glitch, sir. Say that again?",
        toolCalls: Array.isArray(obj.toolCalls) ? obj.toolCalls : []
      };
    } catch {
      parsed = { reply: raw || "Systems glitch, sir. Say that again?", toolCalls: [] };
    }
    res.json(parsed);
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Jarvis request failed";
    if (status >= 500) console.error("[jarvis]", err);
    res.status(status).json({ error: message });
  }
});

// server.ts
dotenv.config({ override: true });
var app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));
app.use("/api/launch", launchRouter);
app.use("/api/jarvis", jarvisRouter);
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
    const ai = await getGemini();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: history.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }]
      })),
      config: { systemInstruction: PHYSIO_SYSTEM_PROMPT }
    });
    res.json({ reply: response.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch response";
    console.error("[physio-chat] Error:", err);
    res.status(500).json({ error: message });
  }
});
var server_default = app;
export {
  server_default as default
};
