# Build Prompt: Ascend Reminders Module (v1)

## Context (read first, verify everything)

Ascend now has a desktop companion app (`E:\imp\projects\jarvis-desktop`) that writes reminders to Firestore at `users/{uid}/reminders`. Each doc has this exact shape — do NOT change it, the desktop app depends on it:

```ts
interface Reminder {
  text: string;       // what to remind
  dueAt: string;      // ISO 8601 datetime
  done: boolean;
  notified: boolean;  // set true once a device has fired the alert
  createdAt: string;  // ISO 8601
  source: 'desktop' | 'web';
}
```

Firestore rules already cover this path (`users/{userId}/{document=**}`) — do not touch `firestore.rules`.

## Task

Add a Reminders feature to the Ascend web app so reminders created by desktop Jarvis are visible/manageable in the web UI, and web-created reminders reach the desktop. Three parts:

1. **Data hook** — new `src/hooks/useReminders.ts`: `onSnapshot` listener on `collection(db, 'users', uid, 'reminders')` (pending = `done == false`, ordered by `dueAt`), plus `addReminder(text, dueAtISO)`, `completeReminder(id)`, `deleteReminder(id)`. This is a SEPARATE collection with its own listener — it must NOT go through `updateState`/`useCloudSync` and must NOT touch the OSState sync payload. Follow the listener/echo-guard style already used in `useCloudSync.ts`. In-browser due-time alerts: schedule `setTimeout`s for pending non-notified reminders, fire a toast + `Notification` (ask permission lazily), then set `notified: true` — mirror how the desktop app does it.

2. **UI module** — a Reminders panel matching the existing liquid-glass design language (study existing components before writing any JSX; reuse the base Modal component — do NOT create a bespoke modal). List pending reminders with due time, add form (text + datetime-local input), complete/delete actions. Wire it into the app's existing module/feature-toggle framework the same way other toggleable modules are wired — find that framework first and follow it exactly. Toggleable, never deletable.

3. **Jarvis tools** — register `set_reminder`, `complete_reminder`, `delete_reminder` tools in the web Jarvis via the existing `registerTools` registry (see `src/features/jarvis/engine/useToolRegistry.ts` and how existing modules register). Args must match the desktop app's declarations: `set_reminder(text, time: ISO local datetime)`, others take `match` (fuzzy words from the reminder text). Add pending reminders to the Jarvis context snapshot via `registerContext`.

## Hard rules

- AUDIT BEFORE CODE: open and read every file you will modify, and the files listed above, BEFORE writing anything. If a file or framework you expected doesn't exist (e.g. the feature-toggle framework), STOP and report — do not invent one.
- Do not delete or rename any existing feature, component, or export.
- Do not modify: `useCloudSync.ts` sync payload, `firestore.rules`, `jarvis-routes.ts`, `transcribe-routes.ts`, `server.ts`.
- No new dependencies.
- Match existing conventions exactly (naming, error handling via console.warn tagged logs, TypeScript style, Tailwind classes used by sibling components).

## Verification gates (all must pass; report honestly if any fail)

1. `npx tsc --noEmit` clean.
2. `npm run build` clean.
3. Manual test script — run dev server and confirm: (a) add a reminder in the UI → doc appears in Firestore with the exact shape above, `source: 'web'`; (b) create a doc manually in the Firestore console → appears in the UI within seconds; (c) set a reminder 1 minute out → browser notification fires and `notified` flips to true; (d) toggling the module off hides it without errors; (e) no console errors on any existing page.
4. List every file you created/modified with a one-line reason each.

If any gate fails, STOP and report the failure — do not claim success.
