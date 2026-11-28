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

## 2026-11-26 Laptop bridge v1 (Blocky review loop)
- Job states reuse the 24 Nov design: 'pending' is "queued", 'running' + stage picked_up|building, plus new awaiting_review, redo, approved. Undo: types.ts and bridge-logic.ts.
- Bridge key: only its SHA-256 in bridge-routes.ts (BRIDGE_KEY_SHA256 env wins), the key itself in tools/laptop-bridge/.bridge-key, same as the TV. No Vercel env change needed. Undo: rotate the key.
- Claims: one lock document per job version (users/{uid}/jobs/{id}/claims/v<n>) using Admin create(), so a version cannot be claimed twice. No transactions needed.
- Test routes /test-job and /test-review let the bridge play Muse for proof, ONLY on jobs it made (requestedBy 'bridge-test'). Undo: delete those two routes.
- Frames: one per shot, taken at the middle of each narrated line (timeline.json), plus one sheet of all shots.

## 2026-11-27 Reels Library
- Owner-only module: `ownerOnly` in registry.ts hides it from nav, Settings, setup and the landing page for every account except OWNER_UID. Undo: drop `ownerOnly` on the reels entry.
- firestore.rules: `users/{uid}/reels` is read-only from the browser; only Muse (Admin SDK) writes. If Muse writes as the signed-in user, add an owner write rule there.
- Added to the phone bar, which is now ten icons for JasMehr only. Hide one from Settings navigation to trim it.
- "Top rated" = score 8 or more and not flagged BS. Change TOP_SCORE in src/features/reels/logic.ts.
- A tag chip filters across all buckets and overrides the tab; picking a tab clears it.
- Sample docs have ids starting `sample-`; remove with `npx tsx tools/seed-reels.ts --remove`.
- 2026-11-28 Reels v3: home is division tiles; a division groups by `subcat` (biggest first, empty as Other last); All groups by division. Default sort inside is by score.
- 2026-11-28 Reels v3: the video is Instagram's /embed/ page, one iframe only for the selected reel. If it hasn't loaded in 12s, or the link isn't an Instagram reel/post, the fallback box shows. Change EMBED_TIMEOUT_MS in ReelsHub.tsx.
- 2026-11-28 Reels v3: search and tags always search every division and show results grouped by division.
- 2026-11-28 Reels v5: swipe is touch/pen only (left archive, right delete after a confirm, 90px); desktop uses Archive/Delete buttons in the opened reel. In Archived, swipe left restores.
- 2026-11-28 Reels v5: rules let only JasMehr's uid update `archived` (bool, nothing else) and delete reels; still no create. Muse must merge-write so `archived` survives (docs/MUSE-LINKS.md).
- 2026-11-28 Reels v4 (arrived after v5): the opened reel leads with the headline (oneLine, else first sentence of whatItIs, else title) in block capitals right under the video, then whatItIs. Cards show the same headline in bold under the title. headlineOf in logic.ts.
- 2026-11-28 Reels v6: an opened reel replaces the list at every width (decision view: video + verdict pane; prev/next, ← → keys, Backspace/Delete remove, A archive, Esc back). Verdict pane shows forYou, else verdict; the rest is below the fold. Removing or archiving opens the next reel.
- 2026-11-28 Sidebar (app-wide): rests as the icon rail; hover or its top button opens the full nav over the page, a click in the page closes it, the pin keeps it open for the browser session (sessionStorage). The old remembered open/closed choice (localStorage ascend_nav) is no longer read. Phones keep the bottom bar.
- 2026-11-28 Reels categories: JasMehr's own categories live in users/{uid}/reelCats (name, side, reelIds), not on Muse's reel docs, so a Muse rewrite can't wipe them; the existing owner rule covers them, no rules change. A reel can be in several.
- 2026-11-28 Reels Work/Personal: a reel's own categories decide its side (can be both); with none, its division does. Default divisions: Work = Opportunities, Claude & Coding, Video & Animation, AI Models & Agents, Business & Creator; Personal = Trading & Finance, Desktop Voice & Home, Deals & Shopping, Entertainment & Explainers. Changeable in Categories > Muse's divisions (users/{uid}/reelPrefs/sides). The switch is remembered per browser.
- 2026-11-28 Reels bulk: "Put all N in…" on any list and "Put in…" on each subcategory header; Undo removes only the reels that bulk add put in.
- 2026-11-28 Reels v7 "Not BS — re-evaluate": one tap, no confirm, writes isBS=false, reevalRequested=true, reevalRequestedAt=server time. Rules allow only those values (isBS only to false, reevalRequested only to true, the time must be the server's), so the page can never re-flag BS or clear a request; Muse does that.
- 2026-11-28 Firestore on-device cache (persistentLocalCache, multi-tab) app-wide in src/lib/firebase.ts, after the daily read quota ran out with 1,300+ reels. Undo: go back to getFirestore.
- 2026-11-28 Reels Claude lane: the switch is All / Work / Personal / Claude. Claude = Claude & Coding bucket, a claude/claude-code/anthropic/mcp/claude-md tag, or a Claude category. Inside, six sections are categories with fixed ids (reelCats/purpose-*), made once on first visit; deleting one keeps it gone. Muse may arrayUnion into those six only. Claude sections don't change a reel's Work/Personal side. "Learn & level up" was added to JasMehr's five.
- 2026-11-28 Turned off on JasMehr's account (features map): stocks (also Kite), physio, vision, buy_list, journal. Turn back on in Settings.
- 2026-11-28 Reels v8: Claude & Coding reels show only in the Claude lane (not in All/Work/Personal tiles, counts, bucket, tag or category pages); tag-only Claude reels from other buckets show in both. Search text still finds them and opens them in the lane. Logic: inSide / isClaudeFirst in logic.ts.
- 2026-11-28 Reels v8: the lane lists nine sections (reelCats/purpose-*) in a fixed order with counts, empty ones included, then "Unsorted — waiting for Muse". A section is recognised by its purpose- id, so the three new ones (side "work") don't count toward Work. His "Claude" category tile opens the lane.
- 2026-11-28 Reels v8: a "Re-evaluation requested: N" strip on the home view lists reels Muse is re-checking; their decision screen shows a disabled requested state instead of the Not BS button. The proof doc zz-bs-test is never counted.
- 2026-11-28 Reels: the Claude home is a grid of big section tiles (2 per row on phone, 3 on desktop) with Unsorted last; tapping one opens that section's list. Replaces the long scrolling section list from v8, at JasMehr's request.
