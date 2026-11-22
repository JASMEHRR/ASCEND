# Decisions

- 2026-11-22 Internships: each entry shows in one section only (status first, then auto-apply, then fully funded). Undo: change `sectionOf` in src/features/internships/logic.ts.
- 2026-11-22 Internships: "Due in 7d" counts only to-review and queued entries, since a deadline no longer matters once applied. Undo: `countInternships` in logic.ts.
- 2026-11-22 Internships: firestore.rules lets the browser change only status, notes, updatedAt, and never create or delete. Assumes Muse writes with the Admin SDK. If Muse writes as the signed-in user, remove the `internships` exclusion and block in firestore.rules.
- 2026-11-22 Internships: added to the phone bar (now 9 icons). Hide one from Settings navigation to get back to 8.
- 2026-11-23 Muse mirror (v2, replaces the v1 reply bridge): Jarvis (Gemini) answers everything in the app and on Telegram; tasks (reminder, research, note, "send to Muse") are also copied to users/{uid}/coach-inbox. Rules in src/features/jarvis/museTasks.ts; widen or narrow them there.
- 2026-11-23 Muse mirror: Jarvis is told in its context that Muse has the task, so it replies in one line and doesn't also set the same reminder. Undo: drop museContextNote from useConversation.ts and telegram-routes.ts.
- 2026-11-23 Muse mirror: in-app copies use channel "app-voice" / "app-text", Telegram uses "telegram-voice" / "telegram-text".
- 2026-11-23 Telegram voice notes are transcribed and answered as a voice message (ElevenLabs Daniel, override with TELEGRAM_VOICE_ID); typed messages still get text.
- 2026-11-23 Muse mirror: short follow-ups to a task ("set another one", typos included) count as the same task and carry the previous message as `context`; Gemini can also call send_to_muse for tasks the rules miss (adds `task`). Rules in src/features/jarvis/museTasks.ts.
