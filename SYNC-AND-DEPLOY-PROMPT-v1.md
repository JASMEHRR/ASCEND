# Sync & Deploy Prompt: land local Jarvis-desktop changes on top of upstream

## Context (read first, verify everything)

This local working copy has uncommitted local work:
- `transcribe-routes.ts` (new file) + a small `server.ts` edit mounting it at `/api/transcribe`, for the desktop Jarvis app's dictation feature.
- `src/features/reminders/*`, `src/hooks/useReminders.ts` (new — Reminders module, already built and verified in a prior session).
- Small edits to `src/App.tsx`, `src/components/SettingsModal.tsx`, `src/components/ui/Modal.tsx`, `src/features/jarvis/ui/JarvisDashboard.tsx`, `src/main.tsx` (Reminders module wiring + a Modal portal bug fix, per prior session).

Meanwhile `origin/main` has moved ~29 commits ahead of this local branch, including changes to `server.ts`, `gemini.ts`, and `jarvis-routes.ts` — looks like a migration of the LLM chain (NIM → Groq as primary, per commit messages `"Groq hop live..."`, `"LLM chain: add Groq as primary — NIM chat is undeliverable from Vercel"`). `git diff --stat origin/main -- server.ts jarvis-routes.ts gemini.ts` shows real changes in all three files, so a naive merge risks either losing the transcribe route or breaking the new Groq chain.

There is also a stale `.git/index.lock` file left over from an earlier interrupted process — delete it before touching git.

## Task

1. `rm -f .git/index.lock` (or `del .git\index.lock` if on Windows shell) — confirm no git process is actually running first (check for other open terminals/VS Code on this repo).
2. `git fetch origin` and read `git log --oneline origin/main -30` to understand what changed upstream, especially in `server.ts`, `gemini.ts`, `jarvis-routes.ts`.
3. `git pull origin main` (merge, not rebase — this repo has no history to protect from rewriting). If it auto-merges cleanly, skip to step 5.
4. If there are conflicts, resolve them file by file:
   - `server.ts`: keep ALL upstream changes (new Groq-related imports/logic), and additionally re-apply the two-line addition that mounts the transcribe router — read the current (pre-conflict) local diff for `server.ts` to see exactly what those two lines were (`import { transcribeRouter } from "./transcribe-routes";` and `app.use("/api/transcribe", transcribeRouter);`, with the mount placed BEFORE the app-wide `express.json({ limit: "256kb" })` middleware, exactly as it was locally — the ordering matters because transcribe's own router needs a larger body limit and Express uses the first matching parser). Do not touch anything else in the conflict region.
   - `gemini.ts` / `jarvis-routes.ts`: take the upstream version entirely (these have no local changes — check `git status`/`git diff` first to confirm) unless a conflict marker appears; if a real conflict does appear here, STOP and report it rather than guessing which side is correct.
   - Any other conflicting file: STOP and report, do not guess.
5. Verify `transcribe-routes.ts` still exists and is unmodified, and that `server.ts` now has both the upstream Groq changes AND the transcribe router mount.
6. Run `npx tsc --noEmit` — must be clean.
7. Run `npm run build` — must be clean (this also runs `build:api`, which bundles `server.ts` into `api/index.js`; confirm the transcribe route appears somewhere in the built `api/index.js`, e.g. `grep -c "api/transcribe" api/index.js` or similar should be > 0).
8. Commit everything with a clear message (e.g. `Merge upstream Groq migration; add /api/transcribe for desktop dictation; add Reminders module`) and push to `origin/main`.
9. Report clearly: what merged cleanly vs. what needed manual resolution, confirmation the transcribe route is present in the final `server.ts` and built `api/index.js`, and confirmation the push succeeded (`git log --oneline -3` after push, matching `origin/main`).

## Hard rules

- Do NOT silently drop the transcribe route or the Reminders module to make the merge easier.
- Do NOT silently drop or alter any upstream Groq/LLM chain change.
- If genuinely unsure which side of a conflict is correct, STOP and ask rather than picking one.
- After pushing, do not attempt to verify the live Vercel deployment yourself (no browser here) — just confirm the push succeeded; a human will check the deploy.
