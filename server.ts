import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

dotenv.config({ override: true });

const app = express();
app.set('trust proxy', true);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get("/api/auth/google/url", (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID secret. The previous default client was deleted, so you must add your own." });
    }

    // Detect active deployed domain dynamically
    let protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    if (Array.isArray(protocol)) protocol = protocol[0];
    if (typeof protocol === 'string' && protocol.includes(',')) protocol = protocol.split(',')[0].trim();

    let host = req.headers['x-forwarded-host'] || req.get('host') || '';
    if (Array.isArray(host)) host = host[0];
    if (typeof host === 'string' && host.includes(',')) host = host.split(',')[0].trim();

    if (host.includes('run.app')) {
      protocol = 'https';
    }

    const redirectUri = `${protocol}://${host}/api/auth/callback/google`;
    console.log(`[OAuth Init] Detected Protocol: ${protocol}, Host: ${host}, Final URI: ${redirectUri}`);

    // Clear stale auth cookies before generating a new link
    res.clearCookie('fit_auth', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      undefined,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/fitness.activity.read',
      'https://www.googleapis.com/auth/fitness.body.read',
      'openid',
      'email',
      'profile'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state: Buffer.from(JSON.stringify({ exactRedirectUri: redirectUri })).toString('base64')
    });

    console.log(`[OAuth] Generating Auth URL. Exact redirect_uri locked to: ${redirectUri}, Client: ...${clientId.slice(-6)}`);

    res.json({ url, exactRedirectUri: redirectUri, clientIdSuffix: clientId.slice(-6) });
  } catch (error: any) {
    console.error("Failed to generate Google OAuth URL", error);
    res.status(500).json({ error: "Failed to generate auth URL", details: error.message });
  }
});

// Google Custom OAuth: Callback handler
app.get("/api/auth/callback/google", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("Authorization code is missing");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "Missing GOOGLE credentials in secrets." });
    }

    let protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    if (Array.isArray(protocol)) protocol = protocol[0];
    if (typeof protocol === 'string' && protocol.includes(',')) protocol = protocol.split(',')[0].trim();

    let host = req.headers['x-forwarded-host'] || req.get('host') || '';
    if (Array.isArray(host)) host = host[0];
    if (typeof host === 'string' && host.includes(',')) host = host.split(',')[0].trim();

    if (host.includes('run.app')) {
      protocol = 'https';
    }

    const dynamicRedirectUri = `${protocol}://${host}/api/auth/callback/google`;
    console.log(`[OAuth Callback] Detected Protocol: ${protocol}, Host: ${host}, Dynamic URI: ${dynamicRedirectUri}`);

    let redirectUri = dynamicRedirectUri;
    if (state && typeof state === 'string') {
      try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        if (decodedState.exactRedirectUri) {
           redirectUri = decodedState.exactRedirectUri;
           console.log(`[OAuth] Successfully recovered explicit EXACT URI from state: ${redirectUri}`);
        }
      } catch (e) {
        console.warn("[OAuth] Failed to decode state parameter, falling back to dynamic URI", e);
      }
    }

    console.log(`[OAuth] Processing callback. Using redirect_uri: ${redirectUri}`);

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code as string);

    if (!tokens.access_token) {
      throw new Error("Failed to retrieve access token from Google");
    }

    console.log(`[OAuth] Token exchange successful for Client: ...${clientId.slice(-6)}. Scopes: ${tokens.scope}`);

    res.cookie('fit_auth', JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              background-color: #09090b;
              color: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .card {
              background-color: #18181b;
              border: 1px solid #27272a;
              border-radius: 1rem;
              padding: 2.5rem;
              max-width: 400px;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            }
            h2 { color: #10b981; margin-top: 0; }
            p { color: #a1a1aa; line-height: 1.5; font-size: 0.9rem; }
            .spinner {
              border: 3px solid rgba(255,255,255,0.1);
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border-left-color: #10b981;
              animation: spin 1s linear infinite;
              margin: 1.5rem auto 0;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Ascend Protocol Link</h2>
            <p>Google Fit Connection Securely Processed!</p>
            <p>Passing credentials to the central application page and locking credentials. This window will self-destruct shortly.</p>
            <div class="spinner"></div>
          </div>
          <script>
            const fullTokens = ${JSON.stringify(tokens)};
            console.log("Popup script executing. Tokens received.");
            if (window.opener) {
              console.log("Sending postMessage to opener: GOOGLE_FIT_AUTH_SUCCESS");
              window.opener.postMessage({ type: 'GOOGLE_FIT_AUTH_SUCCESS', tokens: fullTokens }, '*');
              setTimeout(() => {
                console.log("Closing popup window");
                window.close();
              }, 1000);
            } else {
              console.warn("No window.opener found. Fallback to /");
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Custom Google OAuth Callback Error:", error);
    res.status(500).send(`
      <html>
        <body style="background: #09090b; color: #ef4444; font-family: sans-serif; padding: 2rem; text-align: center;">
          <div style="background: #18181b; border: 1px solid #ef4444; border-radius: 0.5rem; padding: 2rem; max-width: 500px; margin: 4rem auto;">
            <h3>Connection Failed</h3>
            <p style="color: #a1a1aa;">Could not exchange authorize code for tokens.</p>
            <p style="color: #f87171; font-size: 0.85rem;">Error: ${error.message || error}</p>
            <button onclick="window.close()" style="background: #ef4444; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; font-weight: bold;">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }
});

// API: Get Auth Status
app.get("/api/auth/status", (req, res) => {
  let tokensStr = req.headers['x-fit-tokens'] as string || req.cookies.fit_auth;

  if (tokensStr) {
    try {
      const tokens = JSON.parse(tokensStr);
      console.log("[Auth Status] Token parsed successfully. Connected: true");
      res.json({ connected: true, expiry: tokens.expiry_date });
    } catch {
      console.error("[Auth Status] Failed to parse fit_auth tokens");
      res.json({ connected: false });
    }
  } else {
    console.log("[Auth Status] No fit_auth tokens found");
    res.json({ connected: false });
  }
});

// API: Google Fit Step Data
app.get("/api/steps", async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(401).json({
        error: "Google Fit Authorization",
        details: "The default OAuth client is no longer available. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Secrets."
      });
    }

    let tokensStr = req.headers['x-fit-tokens'] as string || req.cookies.fit_auth;
    if (!tokensStr) {
      return res.status(401).json({ error: "Google Fit not connected" });
    }

    let tokens;
    try {
      tokens = JSON.parse(tokensStr);
    } catch (e) {
      return res.status(401).json({ error: "Invalid token format in headers or cookie" });
    }

    const { startTime, endTime } = req.query;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const startTimeMillis = startTime ? parseInt(startTime as string, 10) : startOfDay.getTime();
    const endTimeMillis = endTime ? parseInt(endTime as string, 10) : now.getTime();

    console.log(`[Google Fit API] Token received. Querying interval: ${new Date(startTimeMillis).toISOString()} to ${new Date(endTimeMillis).toISOString()}`);

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials(tokens);

    oauth2Client.on('tokens', (newTokens) => {
      const mergedTokens = { ...tokens, ...newTokens };
      res.cookie('fit_auth', JSON.stringify(mergedTokens), {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
    });

    const fitness = google.fitness({
      version: 'v1',
      auth: oauth2Client
    });

    let duration = endTimeMillis - startTimeMillis;
    if (duration <= 0) {
      duration = 86400000;
    }

    const fetchStepsFromSource = async (dataSourceId?: string, dataTypeName?: string) => {
      try {
        const aggregateBy: any = {};
        if (dataSourceId) aggregateBy.dataSourceId = dataSourceId;
        if (dataTypeName) {
          aggregateBy.dataTypeName = dataTypeName;
        } else {
          aggregateBy.dataTypeName = 'com.google.step_count.delta';
        }

        console.log(`[Google Fit API] Fetching aggregate for ${dataSourceId || dataTypeName || 'default'}...`);
        const response = await fitness.users.dataset.aggregate({
          userId: 'me',
          requestBody: {
            aggregateBy: [aggregateBy],
            bucketByTime: { durationMillis: "3600000" },
            startTimeMillis: startTimeMillis.toString(),
            endTimeMillis: endTimeMillis.toString()
          }
        });

        let steps = 0;
        if (response.data && response.data.bucket) {
          response.data.bucket.forEach(bucket => {
            bucket.dataset?.forEach(dataset => {
              dataset.point?.forEach(point => {
                point.value?.forEach(value => {
                  if (value.intVal !== undefined && value.intVal !== null) {
                    steps += value.intVal;
                  } else if (value.fpVal !== undefined && value.fpVal !== null) {
                    steps += Math.round(value.fpVal);
                  }
                });
              });
            });
          });
        }
        return steps;
      } catch (err: any) {
        console.warn(`[Google Fit API] Failed to fetch for ${dataSourceId || dataTypeName || 'default'}: ${err.message || err}`);
        const errMsg = (err.message || '').toLowerCase();
        if (errMsg.includes('credentials') || errMsg.includes('client') || errMsg.includes('key') || errMsg.includes('invalid_grant') || err.code === 401) {
          throw err;
        }
        return 0;
      }
    };

    const [stepsMerged, stepsEstimated, stepsDelta] = await Promise.all([
      fetchStepsFromSource('derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas'),
      fetchStepsFromSource('derived:com.google.step_count.delta:com.google.android.gms:estimated_steps'),
      fetchStepsFromSource(undefined, 'com.google.step_count.delta')
    ]);

    const totalSteps = Math.max(stepsMerged, stepsEstimated, stepsDelta);
    console.log(`[Google Fit API] Resolved steps - Merged: ${stepsMerged}, Estimated: ${stepsEstimated}, Delta: ${stepsDelta}. Chosen Max: ${totalSteps}`);

    res.json({ steps: totalSteps });
  } catch (error: any) {
    console.error("Step fetch error:", error);
    const errMsg = (error.message || '').toLowerCase();
    if (error.code === 401 || errMsg.includes('credentials') || errMsg.includes('client') || errMsg.includes('invalid_grant')) {
      let cleanDetails = error.message || "Invalid or deleted client credentials";
      if (cleanDetails.includes('deleted_client')) {
        cleanDetails = "Google Fit OAuth client has been deleted on Google Developer Console (deleted_client). Please follow the instructions to set up your custom GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.";
      }
      res.clearCookie('fit_auth', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      });
      return res.status(401).json({
        error: "Google Fit Authorization Mismatch",
        details: cleanDetails
      });
    }
    res.status(500).json({ error: "Failed to fetch steps from Google Fit", details: error.message });
  }
});

// API: Physio Chat using Gemini
app.post("/api/physio-chat", async (req, res) => {
  try {
    const { history } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY environment variable. The AI won't work without it." });
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const SYSTEM_PROMPT = `You are Alex, a highly knowledgeable personal AI physiotherapist assistant specialising in spinal rehab, posture correction, gait mechanics, sports recovery, and mobility training.

Your role is to help the user safely manage and improve these conditions:
// PERSONALIZATION: Update the conditions list, trek date, and red flags below when your situation changes.
- Lumbar disc bulge / disc protrusion
- Poor posture
- Coccyx (tailbone) pain
- Knock knees (genu valgum)
- Chronic right foot pain
- Trek endurance preparation (10 km trek on June 10, may be ~20 km total, with backpack)

CORE RULES:
- Always ask for pain levels (0-10) on first contact if not provided
- Ask whether symptoms are: sharp, dull, burning, tingling, numbness, radiating
- Ask if symptoms worsen with: sitting, walking, bending, stairs, backpack load
- NEVER recommend: toe touches, sit-ups, crunches, heavy squats, heavy spinal loading, twisting under load, jumping, deep spinal flexion
- Always include: "If pain increases, stop immediately"
- Prioritise spinal neutrality and controlled movement

TREK RULES (June 10):
- Avoid overtraining in final 48 hours before trek
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

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: history.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    });

    res.json({ reply: response.text });
  } catch (err: any) {
    console.error("[PhysioChat API] Error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch response" });
  }
});

// Export for Vercel serverless — static files served by Vercel from dist/
export default app;
