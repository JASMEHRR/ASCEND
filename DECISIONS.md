# Decisions

- 2026-11-22 Internships: each entry shows in one section only (status first, then auto-apply, then fully funded). Undo: change `sectionOf` in src/features/internships/logic.ts.
- 2026-11-22 Internships: "Due in 7d" counts only to-review and queued entries, since a deadline no longer matters once applied. Undo: `countInternships` in logic.ts.
- 2026-11-22 Internships: firestore.rules lets the browser change only status, notes, updatedAt, and never create or delete. Assumes Muse writes with the Admin SDK. If Muse writes as the signed-in user, remove the `internships` exclusion and block in firestore.rules.
- 2026-11-22 Internships: added to the phone bar (now 9 icons). Hide one from Settings navigation to get back to 8.
- 2026-11-23 Muse bridge: all Telegram text and voice goes to Muse via users/{uid}/coach-inbox; "/j <message>" still reaches Jarvis and its tools (reminders, habits, email). Undo: set MUSE_BRIDGE=off on Vercel.
- 2026-11-23 Muse bridge: Vercel can't hold a listener, so the webhook waits 45s for a quick reply; later replies go out on the next /api/telegram/cron pass or a call to /api/telegram/coach-deliver (CRON_SECRET). Undo: coach-bridge.ts.
- 2026-11-23 Muse bridge: spoken with ElevenLabs Daniel (Jarvis's default) since the app's voice choice lives only in the browser. Override with TELEGRAM_VOICE_ID.
