/**
 * Ascend Protocol — API server.
 *
 * Runtime shapes:
 *  - Vercel serverless: `api/index.ts` re-exports the default `app`; Vercel's
 *    CDN serves the built client from `dist/` (see `vercel.json`). The
 *    dev/prod bootstrap block at the bottom is skipped (guarded by `VERCEL`).
 *  - Local dev (`npm run dev` -> `tsx server.ts`): Vite runs as Express
 *    middleware so a single process on PORT serves both the API and the app.
 *  - Local prod (`npm run build && npm run start`): the bundled server serves
 *    the static client from `dist/`.
 */
import express from "express";
import dotenv from "dotenv";

dotenv.config({ override: true });

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "100kb" }));

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

// AI physiotherapist chat, backed by Gemini.
app.post("/api/physio-chat", async (req, res) => {
  try {
    const { history } = req.body ?? {};
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: "`history` must be an array of messages." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY environment variable." });
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: history.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
      config: { systemInstruction: PHYSIO_SYSTEM_PROMPT },
    });

    res.json({ reply: response.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch response";
    console.error("[physio-chat] Error:", err);
    res.status(500).json({ error: message });
  }
});

// Exported for the Vercel serverless handler (see api/index.ts).
export default app;

// Standalone server for local dev / prod. Skipped on Vercel serverless.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;

  (async () => {
    const path = await import("node:path");
    const isProd = process.env.NODE_ENV === "production";

    if (isProd) {
      const distIndex = path.resolve("dist/index.html");
      // Serve the pre-built client.
      app.use(express.static(path.resolve("dist")));
      app.get("*", (_req, res) => res.sendFile(distIndex));
    } else {
      // Serve the client through Vite in middleware mode (single-port dev).
      const { createServer } = await import("vite");
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }

    app.listen(port, () => {
      console.log(`\n  ➜  Ascend Protocol running at http://localhost:${port}\n`);
    });
  })();
}
