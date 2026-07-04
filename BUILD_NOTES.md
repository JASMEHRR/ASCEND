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

- [x] Phase 0 — Housekeeping: this file; fixed dangling `review` view in
      `appTools.ts` navigate tool; de-hardcoded the stale "Launch Before June 29"
      BusinessHub header (now shows `state.primaryObjective`).
- [ ] Phase 1 — Conversational quality: keep ✓/⚠ status suffixes out of the
      model-bound transcript; allow full-length answers for informational/general
      questions (drop the blanket ~60-word cap; keep spoken reply short separately);
      reinforce general-purpose scope in PERSONA. Test: reference something from
      2+ messages earlier.
- [ ] Phase 2 — Voice: deterministic persisted voice pick (en-GB male chain,
      `onvoiceschanged`-safe), settings picker, persist mute.
- [ ] Phase 3 — UI overhaul: canvas particle-network orb (state → density/motion/
      glow); minimal home (orb + input); collapsible secondary panels, one-at-a-time
      on small viewports; cap recent-action chips at 3; persistent settings icon
      near orb; light+dark themes; de-duplicate header stats.
- [ ] Phase 4 — Toggle framework: flagship features become real toggleable modules;
      per-Launch-subtab toggles; instant dashboard updates.
- [ ] Phase 5 — Google GIS OAuth + Calendar read/write + daily planning
      (propose → approve → sync). GOOGLE_SETUP.md for the user.
- [ ] Phase 6 — Gmail: inbox summary, urgent flags, draft replies (never auto-send).
- [ ] Phase 7 — Stocks/finance: Yahoo proxy routes; portfolio, watchlist+alerts,
      budgeting, net worth via `updateState`.
- [ ] Phase 8 — Journaling: text+voice, Obsidian `Journal/` sync, toggleable.
- [ ] Phase 9 — Proactive insights: toast system, active-hours gate (default
      08:00–22:00, configurable), toast + voice delivery, throttled.
- [ ] Phase 10 — `tsc --noEmit` clean, build, push main, verify LIVE on deployed
      site (multi-turn memory test, voice, toggles, declutter).

## Architecture invariants (do not break)

- All state writes go through `updateState` (`src/hooks/useCloudSync.ts`) —
  Firestore two-doc sync + points accrual depend on it. New OSState fields are
  additive only.
- Gemini calls stay server-side (`gemini.ts`, key in `GEMINI_API_KEY`).
- Obsidian stays client→localhost, per-uid config, credentials never touch our server.
- Jarvis tools register through the client registry; backend stays stateless.
