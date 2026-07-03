# Ascend Protocol

A high-performance life-management dashboard: habit stacking, physical-recovery
tracking, business ideation, and daily discipline scoring — wrapped in an
animated "liquid glass" UI.

## Features

- **Dashboard** — daily rituals, water/exercise tracking, and a live discipline score.
- **AI Physio** — recovery and mobility guidance.
- **Strategic Command** — capture and triage business ideas.
- **Weekly Review**, **Vision Board**, and a passcode-locked **Purchases** list.
- Manual daily **step logging** and **Firestore** cloud sync with local-storage fallback.
- Adaptive time-of-day atmospheres, reward milestones, and a system-log console.

## Tech

React 19 + TypeScript + Vite + Tailwind, a small Express (`server.ts`) API for the
Gemini-backed AI Physio chat, and Firebase (Auth + Firestore).

## Run locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and set your `GEMINI_API_KEY`.
3. Start the dev server (Vite + Express on one port via `tsx`):
   ```
   npm run dev
   ```
   Then open http://localhost:3000.

## Other scripts

- `npm run build` — build the client and bundle the server.
- `npm run start` — run the production server bundle.
- `npm run lint` — type-check with `tsc --noEmit`.

## Deploy on Vercel

The client is built by Vercel's CDN and the Express app runs as a serverless
function (`api/index.ts` re-exports it); routing is configured in `vercel.json`.

1. Import the repo in Vercel (framework preset: **Other** / Vite).
2. Add the `GEMINI_API_KEY` environment variable in the Vercel project settings.
3. Deploy. Vercel runs `npm run vercel-build` and serves `dist/` from the CDN,
   with `/api/*` handled by the serverless function.

Firestore rules live in `firestore.rules` and the Firebase web config in
`firebase-applet-config.json`.
