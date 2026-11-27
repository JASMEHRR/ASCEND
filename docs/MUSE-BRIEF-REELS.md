Muse, here is what changed in Ascend on 28 and 29 Nov 2026 and what you need to do about it. Firestore project `ascend-57d4e`, everything under `users/dBZTvCHfyiPHFLjHxv2ckf37iOr2`. Live app: https://ascend-delta-sage.vercel.app (Reels Library and Internships pages).

1. NEW JOB: the re-evaluation queue (most important)
JasMehr now has a "Not BS, re-evaluate" button on every reel you flagged `isBS: true`. One tap writes exactly three fields on that reel doc: `isBS: false`, `reevalRequested: true`, `reevalRequestedAt: <server timestamp>`. Nothing else changes, so the old verdict, score and claims are still your previous review.
What you do:
- Regularly query `reels` where `reevalRequested == true`.
- For each, research the reel again from scratch (do not just reuse the old verdict), then write the fresh review: `verdict`, `oneLine`, `score`, `isBS`, `claims`, `sources`, `forYou`, `nextAction`, `links`, as needed.
- In the same write, clear the request: `reevalRequested: false` (keep `reevalRequestedAt` as the record of when he asked).
- If you still think it is BS after a real re-check, you may set `isBS: true` again, but say why in `verdict` and `forYou` so he sees what changed his mind or did not.
- The app can never clear `reevalRequested` or re-flag `isBS`; the security rules stop it. Clearing is your job.

2. Write reels with merge, never a full overwrite
Always `update()` or `set(data, { merge: true })` on reel docs. JasMehr sets `archived` (true/false) and the re-eval fields from the app; a full `set()` without merge wipes them. Never write `archived` yourself. A reel doc that disappeared was deleted by him on purpose: do not recreate it.

3. Fields the page now reads (keep filling them)
- `subcat`: subcategory inside the bucket (free text; new ones appear on the page automatically).
- `links`: array of `{ label, url (string or null), paid (boolean), note }`. Every product, repo, tool or service the reel mentions. `paid: true` shows a big PAID badge, so be accurate; put the price and the catch in `note`.
- `forYou`: your verdict on whether this reel helps HIM, against his real setup (Claude subscription, his PCs, Muse plus Ascend, his projects). It is now the main text in the decision screen, ahead of `verdict`. Backfill it on more reels.
- `oneLine`: shown in big block capitals as the headline. It must be a real one-line summary. Many `jm-*` reels currently have the raw Instagram caption with hashtags there (example: "6 GITHUB REPOS THAT MAKE YOU MONEY WITH AI #AI #TECH"). Please rewrite those.

4. His own categories (app-owned, read only for you)
He can now make his own categories (example: Anime as Personal, Claude as Work) and mark each Work or Personal. They live in `users/{uid}/reelCats/{id}` as `{ name, side: "work" | "personal", reelIds: [...] }`, plus `users/{uid}/reelPrefs/sides` (which of your buckets count as Work or Personal). You may read these to understand what he cares about. Never write to them.

5. Firestore read quota ran out on 29 Nov (about 2:30 AM IST)
The project hit its daily read limit. Reads come back at about 1:30 PM IST (midnight Pacific). With 1,300+ reel docs, every full read of the `reels` collection costs 1,300+ reads.
- Do not re-read the whole `reels` collection to find work. Query only what you need (`reevalRequested == true`, or docs you are about to edit).
- Batch your writes, and avoid writing reels that did not change.
- The app now caches Firestore on the device to cut its own reads.

6. Small things, for your context only
- Internships page has a new "Due today" stat (open entries whose deadline is today). No change needed from you.
- The Reels decision screen: video left, verdict pane right, with Remove and Archive. Removing deletes the doc.

Reply to JasMehr with: how many reels are in the re-eval queue right now, when you will process them, and how many `jm-*` headlines you plan to rewrite.
