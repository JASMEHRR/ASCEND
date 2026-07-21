# Ascend Protocol — Build Notes

# v4 pass (2026-07-05)

Four additions on the stable v3 base. All phases committed separately; see git log.

## Locked decisions (from the up-front batch)

- **Kite redirect URL** (registered in the kite.trade app console):
  `https://ascend-delta-sage.vercel.app/api/kite/callback` — production only
  (Kite allows one redirect URL per app), so OAuth testing happens against the
  live deploy; a DEV-only paste-token field in Settings covers local work.
- **Model: Llama 4 Maverick** (`llama-4-maverick-17b-128e-instruct`).
  Rationale: MoE (~17B active params) = flash-class latency; reliable strict-JSON
  instruction following (the Jarvis protocol needs raw JSON); 1M context.
  Rejected: Nemotron variants (reasoning `<think>` overhead — wrong for a voice
  assistant), Mistral Large (slower dense model).
  - **PROVIDER FINDING (2026-07-05): NVIDIA NIM is unusable from Vercel.**
    From the deployed function, `GET /v1/models` returns 200 in ~13ms but
    `POST /v1/chat/completions` never returns a byte (buffered OR streamed;
    User-Agent set; key valid — same request from a residential IP answers in
    ~1s). Matches public reports of NIM hanging via gateways/containers.
    Diagnosed with the temporary `/api/llm-health` route (remove when stable).
  - **Chain in `llm.ts`** (missing key = hop skipped, all OpenAI-compatible
    hops share one code path): **Groq `llama-3.3-70b-versatile`** (free
    ~30 req/min, console.groq.com, works from Vercel; Groq no longer hosts
    Maverick — 3.3-70b is the best conversational fit there) → **NIM
    Maverick** (works from local dev; 15s timeout in case its edge recovers)
    → gemini-2.5-flash → gemini-2.5-flash-lite → clear 429 message, never a
    silent failure. Physio + LaunchKit share the same chain. The temporary
    /api/llm-health diagnostic route was removed after diagnosis.
  - **Free-tier ToS note**: NVIDIA's and Groq's free endpoints are meant for
    development/evaluation-scale use, not serving real traffic. Fine while
    this app serves only its owner; revisit if it ever gets real users.
- **TTS: ElevenLabs** (`eleven_flash_v2_5`, 0.5 credits/char, 500-char input
  clamp in `/api/tts`). Voice pinned via the existing storage key using an
  `eleven:<voiceId>` prefix; browser pins unaffected. On quota/auth failure the
  session latches to the pinned browser SpeechSynthesis voice — silent
  fallback + an amber hint in Settings. Curated voices: Daniel / George / Brian.
- **Web search: Tavily** (free 1000/mo) as a `webSearch` followUp tool — the
  model itself classifies whether a query needs live data, so no per-message
  search cost. **Gemini Search grounding deliberately skipped**: it would burn
  the tiny Gemini daily quota that now backs the chat fallback chain.
- **Kite Connect: read-only by construction** — the router has login/callback/
  holdings/positions/margins only, no order endpoints. API secret server-side
  only; token exchange = SHA-256(api_key + request_token + api_secret) on the
  server; access_token handed to the SPA via URL fragment (never hits logs),
  stored per-user in localStorage (`ascend_kite_token_${uid}`, Obsidian
  pattern) — backend stays stateless. Daily ~7:30am IST expiry surfaces as
  401 `kite_token_expired` → 'expired' state → "Reconnect Kite" in Settings
  and in the StocksHub panel.

## New env vars (all server-side, none VITE_-prefixed; add to Vercel + local .env)

| Var | Purpose | Where to get it |
| --- | --- | --- |
| `NVIDIA_API_KEY` | Primary LLM (NIM) | build.nvidia.com (free, no card) |
| `ELEVENLABS_API_KEY` | Premium TTS | elevenlabs.io (free tier) |
| `TAVILY_API_KEY` | Web search | tavily.com (free, 1000/mo) |
| `KITE_API_KEY` / `KITE_API_SECRET` | Zerodha portfolio | developers.kite.trade (Personal, free) |

Everything degrades gracefully while a key is missing: chat → Gemini chain,
voice → browser TTS, search/Kite → clear "not configured" replies.

## v4 phase checklist

- [x] Phase 1 — llm.ts provider chain; Jarvis/physio/LaunchKit swapped (42512d7)
- [x] Phase 2 — /api/tts + eleven: voice pinning + Settings picker groups
- [x] Phase 3 — /api/search + WebSearchRegistrar tool
- [x] Phase 4 — /api/kite + KiteProvider/Settings/Registrar/Panel
- [x] Phase 5 — pushed to main, deployed, verified live (2026-07-05):
      multi-turn recall through the new llm.ts chain (two facts stated,
      recalled after unrelated turns — Gemini path, NIM key not yet set);
      /api/tts, /api/search, /api/kite all return clean "not configured"
      responses instead of crashing; /api/kite/login correctly round-trips
      to /#kite_error=not_configured.
- [ ] PENDING USER: set the five v4 env vars in Vercel, then re-verify the
      key-dependent paths — NIM as primary (memory test again), ElevenLabs
      voice audible, weather query triggers webSearch (a general question
      doesn't), full Kite OAuth round trip + "how's my portfolio doing".

---

# v3 Build Notes

Running log for the v3 rebuild pass (started 2026-07-04). If a session is cut off,
resume from the last commit and this checklist — the full spec lives in the v3 build
prompt; decisions already made are recorded here so nothing needs re-asking.

## Locked decisions (from the up-front Q&A)

- **Google OAuth**: client-side Google Identity Services (GIS) token flow.
  Scopes: `calendar.events`, `gmail.readonly`, `gmail.compose` (drafts only, never send).
  Client ID via `VITE_GOOGLE_CLIENT_ID`. User must create the OAuth client in GCP
  console and add themselves as a test user (setup steps in GOOGLE_SETUP.md once written).
- **Stocks data**: Yahoo Finance public endpoints proxied through the backend —
  covers Indian (.NS/.BO) + international tickers, no API key. Graceful fallback UI
  if Yahoo changes endpoints. Budget/net-worth are manual entry.
- **Theme**: build BOTH light and dark, liquid-glass preserved on both. Near-black
  command-center is the dark default.
- **News feed**: SKIPPED this pass (user decision).
- **Launchpad/Strategic Command**: keep as one submenu; each sub-tool
  (Command/Validate/Offer/Prospects/Outreach/Ideas) individually toggleable.
- **Voice**: pin a British male (JARVIS-style) TTS voice, persisted; picker in
  settings. Keep `en-IN` speech recognition for input.
- **Conversational bug**: user saw single-turn behavior on the DEPLOYED site.
  Code already sends last-24-turn history — suspect stale deploy + transcript
  pollution (✓/⚠ suffixes replayed) + 60-word reply cap. Fix quality + verify live.
- Excluded features stay excluded: student tracking, CRM/invoicing/inventory.
- Monetization: tier-ready toggles only, no paywall logic.

## Phase checklist

- [x] Phase 0 — Housekeeping (e9da9bc)
- [x] Phase 1 — Conversational quality (5534d2f): clean model transcript, `speak`
      vs `reply` split, general-purpose + continuity persona, 4096 max tokens.
      Multi-turn verified against the deployed API (recalled facts from 2 and 4
      messages back). UI-level live test pending below.
- [x] Phase 2 — Voice pinned + persisted, settings picker, mute persists (e62e5a4)
- [x] Phase 3 — UI overhaul (e77ab38): canvas particle orb, minimal orb-first
      home, collapsible dock (one panel at a time), chips capped at 3,
      Customize button in dock, light+dark liquid glass, header de-duplicated
- [x] Phase 4 — Per-sub-tool toggles for Strategic Command (33ccde7)
- [x] Phase 5 — GIS OAuth + Calendar + planning propose→approve (b3d0a8a).
      NOTE: needs `VITE_GOOGLE_CLIENT_ID` env in Vercel — user action, see
      GOOGLE_SETUP.md. UI degrades gracefully until then.
- [x] Phase 6 — Gmail drafts-only module (94097c8)
- [x] Phase 7 — Stocks & Finance, Yahoo proxy verified live for .NS + US (8f60291)
- [x] Phase 8 — Journaling + Obsidian vault sync (cbf5435)
- [x] Phase 9 — Proactive insights, toasts + voice, active hours (826895e)
- [x] Phase 10 — pushed to main, auto-deployed, verified LIVE (2026-07-05):
      multi-turn recall in the real UI (facts referenced from 2+ messages back),
      general-knowledge answers, tool status chips, particle orb states,
      collapsible dock + one-panel-at-a-time, Customize entry, light+dark theme
      flip, stocks page pulling a real RELIANCE.NS quote (₹1,304, +0.04%),
      voice pinned to "Google UK English Male". Test data cleaned from memory
      afterwards; RELIANCE.NS left on the watchlist as a working demo.

## Post-verification fixes (also live)

- View switches could land invisible (AnimatePresence mode="wait" dropped the
  enter animation) → enter-only keyed fade (7afa4ee).
- ROOT CAUSE of "Jarvis randomly broken" in production: the Gemini key is on
  the FREE tier — 20 requests/day for gemini-2.5-flash. Added automatic
  fallback to gemini-2.5-flash-lite on quota errors + human-readable quota
  message (dc37a2a). Verified live with the primary quota exhausted.

## User actions still required

1. Create the Google OAuth client + set `VITE_GOOGLE_CLIENT_ID` in Vercel
   (full steps: GOOGLE_SETUP.md). Until then the Google section in Settings
   shows a "not configured" notice and planning falls back to tasks.
2. ~~Upgrade the Gemini API key~~ — superseded by v4: NVIDIA NIM (free,
   ~40 req/min) is now the primary model; Gemini free tier is the fallback.
   Set `NVIDIA_API_KEY` in Vercel (see v4 section above).

## Watch items

- Proactive-greeting toggle rendered "off" in Settings while the greeting still
  fired once — possible read-before-Firestore-load race in CoreRegistrar
  (pre-existing). Re-check if the user reports greeting misbehaviour.

## Architecture invariants (do not break)

- All state writes go through `updateState` (`src/hooks/useCloudSync.ts`) —
  Firestore two-doc sync + points accrual depend on it. New OSState fields are
  additive only.
- Model calls stay server-side (`llm.ts` chain over `gemini.ts`; keys in
  `NVIDIA_API_KEY` / `GEMINI_API_KEY`). Same for `ELEVENLABS_API_KEY`,
  `TAVILY_API_KEY`, `KITE_API_KEY`/`KITE_API_SECRET` — nothing secret is ever
  `VITE_`-prefixed.
- Obsidian stays client→localhost, per-uid config, credentials never touch our server.
- Jarvis tools register through the client registry; backend stays stateless.
