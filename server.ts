/**
 * Ascend Protocol — API server.
 *
 * This module defines the Express app and API routes ONLY. It is imported by:
 *  - Vercel serverless via `api/index.ts` (which re-exports the default `app`);
 *    Vercel's CDN serves the built client from `dist/` (see `vercel.json`).
 *  - `dev-server.ts` for local dev/prod, which adds Vite middleware (dev) or
 *    static `dist/` serving (prod) and calls `listen`.
 *
 * Keep this file free of dev-only imports (Vite, etc.) so the serverless
 * function bundle stays lean.
 */
import express from "express";
import dotenv from "dotenv";
import { generateChat, GeminiError } from "./llm";
import { launchRouter } from "./launch-routes";
import { jarvisRouter } from "./jarvis-routes";
import { stocksRouter } from "./stocks-routes";
import { ttsRouter } from "./tts-routes";
import { searchRouter } from "./search-routes";
import { kiteRouter } from "./kite-routes";

dotenv.config({ override: true });

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));

// LaunchKit AI endpoints (stateless; persistence lives client-side in Firestore).
app.use("/api/launch", launchRouter);
// Jarvis AI command core (tool-registry relay).
app.use("/api/jarvis", jarvisRouter);
// Market data proxy (Yahoo Finance — Indian + international tickers).
app.use("/api/stocks", stocksRouter);
// ElevenLabs TTS proxy (key stays server-side; client falls back to browser TTS).
app.use("/api/tts", ttsRouter);
// Live web search (Tavily) — powers Jarvis's webSearch tool.
app.use("/api/search", searchRouter);
// Zerodha Kite Connect — read-only portfolio (login, token exchange, proxies).
app.use("/api/kite", kiteRouter);

// The AI physiotherapist's persona and safety rules. Personalise the
// conditions / trek details below as the user's situation changes.
const PHYSIO_SYSTEM_PROMPT = `You are Alex, a highly knowledgeable personal AI physiotherapist assistant specialising in spinal rehab, posture correction, gait mechanics, sports recovery, and mobility training.

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

// AI physiotherapist chat, through the shared provider chain (llm.ts).
app.post("/api/physio-chat", async (req, res) => {
  try {
    const { history } = req.body ?? {};
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: "`history` must be an array of messages." });
    }

    const reply = await generateChat({
      system: PHYSIO_SYSTEM_PROMPT,
      messages: history.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: String(m.content ?? ""),
      })),
    });

    res.json({ reply });
  } catch (err: unknown) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Failed to fetch response";
    if (status >= 500) console.error("[physio-chat] Error:", err);
    res.status(status).json({ error: message });
  }
});

// TEMPORARY diagnostic: measures NIM reachability from this deployment.
// Exposes only latency/status codes, no secrets. Remove once the NIM
// egress issue is resolved.
app.get("/api/llm-health", async (_req, res) => {
  const key = process.env.NVIDIA_API_KEY ?? "";
  const probe = async (label: string, fn: () => Promise<globalThis.Response>) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      const body = (await r.text().catch(() => "")).slice(0, 120);
      return { label, ok: r.ok, status: r.status, ms: Date.now() - t0, body };
    } catch (e) {
      return { label, ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), ms: Date.now() - t0 };
    }
  };
  const results = [];
  results.push(
    await probe("models GET", () =>
      fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${key}`, "User-Agent": "ascend-jarvis/4.0" },
        signal: AbortSignal.timeout(8000),
      }),
    ),
  );
  results.push(
    await probe("chat POST", () =>
      fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "ascend-jarvis/4.0" },
        body: JSON.stringify({ model: "meta/llama-4-maverick-17b-128e-instruct", messages: [{ role: "user", content: "Say: ok" }], max_tokens: 5 }),
        signal: AbortSignal.timeout(10_000),
      }),
    ),
  );
  // Streamed variant: some edges deliver SSE where buffered responses hang.
  {
    const t0 = Date.now();
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream", "User-Agent": "ascend-jarvis/4.0" },
        body: JSON.stringify({ model: "meta/llama-4-maverick-17b-128e-instruct", messages: [{ role: "user", content: "Say: ok" }], max_tokens: 5, stream: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const text = r.body ? await new globalThis.Response(r.body).text() : "";
      results.push({ label: "chat POST stream", ok: r.ok, status: r.status, ms: Date.now() - t0, body: text.slice(0, 200) });
    } catch (e) {
      results.push({ label: "chat POST stream", ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), ms: Date.now() - t0 });
    }
  }
  res.json({ keyPresent: !!key, keyLen: key.length, results });
});

// Exported for the Vercel serverless handler (see api/index.ts).
// NOTE: this file must stay free of any dev-only imports (e.g. Vite) so the
// serverless function bundle stays small. The local dev/prod server that wires
// up Vite / static file serving lives in the separate `dev-server.ts` entry.
export default app;
