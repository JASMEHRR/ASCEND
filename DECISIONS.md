# Decisions

- 2026-11-22 Internships: each entry shows in one section only (status first, then auto-apply, then fully funded). Undo: change `sectionOf` in src/features/internships/logic.ts.
- 2026-11-22 Internships: "Due in 7d" counts only to-review and queued entries, since a deadline no longer matters once applied. Undo: `countInternships` in logic.ts.
- 2026-11-22 Internships: firestore.rules lets the browser change only status, notes, updatedAt, and never create or delete. Assumes Muse writes with the Admin SDK. If Muse writes as the signed-in user, remove the `internships` exclusion and block in firestore.rules.
- 2026-11-22 Internships: added to the phone bar (now 9 icons). Hide one from Settings navigation to get back to 8.
