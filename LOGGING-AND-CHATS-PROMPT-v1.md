# Claude Code prompt — finish backend logging + verify separate chats

Copy everything below the line into Claude Code from the repo root
(`E:\imp\projects\ASCEND`).

---

You are working in the Ascend Protocol repo (React 19 + TypeScript + Vite +
Tailwind v4 + Firebase, deployed to Vercel, Firestore project `ascend-57d4e`).

## What already landed (commit `8aa8885`) — do NOT rebuild this

Jarvis chats were just refactored from one endless transcript into separate
threads, and activity logs were moved out of the UI to the server:

- `src/features/jarvis/engine/chats.ts` (new) — Firestore layer for
  `users/{uid}/jarvisChats/{chatId}`, one doc per conversation
  (`{title, createdAt, updatedAt, messages[]}`), live-subscribed newest-first.
  Replaced the old single `users/{uid}/jarvis/chat` doc and its
  `chatHistory` archive doc.
- `src/features/jarvis/engine/useConversation.ts` — rewritten around
  `chats` + `activeChatId`. `activeChatId === null` IS the dashboard home
  screen and is where every load starts; sending a message from there opens a
  new chat. Exposes `newChat` / `openChat` / `removeChat`. The old 5-minute
  idle auto-reset was removed. Chat titles: a draft from the first message
  shows immediately, then a short model-generated title replaces it after the
  first exchange.
- `src/features/jarvis/ui/JarvisDashboard.tsx` — the "Log" dock panel became a
  "Chats" panel (open / switch / delete), the recent-action chips were deleted,
  and the hero + "Greet me on login" toggle now show whenever no chat is open.
- `server-log.ts` (new) — writes structured entries to a `_logs` Firestore
  collection via the Admin SDK. Degrades to console output when
  `FIREBASE_SERVICE_ACCOUNT` is unset. `firebase-admin` is an
  **optionalDependency** imported via a non-literal specifier so the project
  builds and every API route works even when it isn't installed.
- `jarvis-routes.ts` — error path now calls `logEvent(...)`.
- `firestore.rules` — documented that `_logs` is server-only; the existing
  catch-all `allow read, write: if false` already denies all client access.

Typecheck and lint were clean at that commit.

## Your tasks

### 1. Install the optional dependency

```
npm install
```

Confirm `firebase-admin` resolves and that `npm run lint` (which is
`tsc --noEmit`) still passes afterwards.

### 2. Wire `logEvent` into the remaining API routes

Right now only `jarvis-routes.ts` logs. Add the same treatment to the other
routers' error paths, using a distinct `scope` per route:

- `kite-routes.ts` → scope `kite`
- `search-routes.ts` → scope `search`
- `stocks-routes.ts` → scope `stocks`
- `tts-routes.ts` → scope `tts`
- `transcribe-routes.ts` → scope `transcribe`
- `launch-routes.ts` → scope `launch`

Rules for this:
- Import with `import { logEvent } from './server-log';`
- Log **errors and warnings only** — do not log every successful request, and
  never log tokens, API keys, request bodies, or Kite access tokens. `meta`
  should hold small scalars like `{ status }`.
- `logEvent` must never be awaited and never be allowed to fail a request.

### 3. Verify the chat separation actually works

Run the app (`npm run dev`) and check, in the browser:

1. On load, the dashboard shows the **home screen** — big orb, greeting with
   your name, the discipline/streak/tasks/habits stat cards, the suggestion
   chips, and the "Greet me on login" toggle. It must NOT open straight into a
   previous conversation.
2. Send a message → a new chat opens, the hero collapses, and a "New chat"
   button appears above the console.
3. Open the **Chats** panel from the right-hand panel rail → the chat is
   listed. After the first reply completes, its title should change from the
   truncated first message to a short generated title.
4. Start a second chat and confirm the two transcripts are genuinely separate —
   switching between them shows different messages, and neither leaks context
   into the other's visible thread.
5. Delete a chat from the panel and confirm it disappears and (if it was open)
   you land back on the home screen.
6. Reload the page: chats persist, and you land on the home screen again.

Fix anything that fails. Report what you actually observed — do not assume it
works because the code looks right.

### 4. Confirm logs never reach the frontend

Grep the client for any surviving log UI and confirm there is none:

```
rg -n "recentActions" src/
```

`useJarvisMemory` may still *record* actions (Jarvis uses them for context) —
that's correct. What must not exist is any component rendering them.

## Constraints

- **Never run `git push`.** Commit locally and tell me the command to run.
- **Never `git add .`** — stage only the specific files you changed. The repo
  has many unrelated in-progress files (Gmail/Google/Kite/Journal/Obsidian/
  Planning/Stocks/WebSearch) that must not be swept into a commit.
- Never commit the `.claude/` directory.
- No paid API keys or metered third-party services. Free tiers and
  open-source only. Firebase/Firestore free tier is fine.
- Run `npx tsc --noEmit -p .` and `npm run lint` before committing.
- Firestore rules changes require a separate `firebase deploy --only
  firestore:rules` — call that out explicitly if you touch them.
- Commit with:
  `git -c user.name="jasmehr" -c user.email="jasmehr2005@gmail.com" commit -m "..."`

## Note on the service account (I'll do this part, not you)

Backend logs only reach Firestore once `FIREBASE_SERVICE_ACCOUNT` is set in
Vercel (Firebase console → Project settings → Service accounts → Generate key,
then paste the whole JSON into a Vercel env var of that name). Until then
`logEvent` falls back to console output visible in `vercel logs`. Don't try to
create or commit a service account key — never put one in the repo.
