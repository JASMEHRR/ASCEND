# Ascend Protocol — v3 Build Notes

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
2. STRONGLY RECOMMENDED: upgrade the Gemini API key to a paid tier (or raise
   quota) — 20 req/day is a handful of Jarvis exchanges. The flash-lite
   fallback softens this but has its own daily cap.

## Watch items

- Proactive-greeting toggle rendered "off" in Settings while the greeting still
  fired once — possible read-before-Firestore-load race in CoreRegistrar
  (pre-existing). Re-check if the user reports greeting misbehaviour.

## Architecture invariants (do not break)

- All state writes go through `updateState` (`src/hooks/useCloudSync.ts`) —
  Firestore two-doc sync + points accrual depend on it. New OSState fields are
  additive only.
- Gemini calls stay server-side (`gemini.ts`, key in `GEMINI_API_KEY`).
- Obsidian stays client→localhost, per-uid config, credentials never touch our server.
- Jarvis tools register through the client registry; backend stays stateless.
