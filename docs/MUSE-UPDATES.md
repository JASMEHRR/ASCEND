# Ascend updates for Muse (27 and 28 Nov 2026)

Muse, this is everything that changed in Ascend in the last three days and what you need to do. Firestore project `ascend-57d4e`, all data under `users/dBZTvCHfyiPHFLjHxv2ckf37iOr2`. Live app: https://ascend-delta-sage.vercel.app

## Your action items (in priority order)

1. **Process the re-evaluation queue** (section 2). New, ongoing.
2. **Write reel docs with merge only** (section 3). Never a full overwrite.
3. **Stop full reads of the `reels` collection** (section 6). The daily read quota ran out.
4. **Rewrite bad headlines**: many `jm-*` reels have the raw Instagram caption with hashtags in `oneLine` (example: "6 GITHUB REPOS THAT MAKE YOU MONEY WITH AI #AI #TECH"). `oneLine` is shown in big block capitals as the headline, so it must be a real one-line summary.
5. **Sort Claude reels by what they are for** (section 5b). New, ongoing.
6. **Keep backfilling** `forYou`, `links` and `subcat` (section 4).
7. **Stop sending** stock, portfolio, physio, vision board, purchases and journal items into Ascend for now (section 7).

Reply to JasMehr with: how many reels are in the re-eval queue, how many Claude reels you sorted into sections, and how many `jm-*` headlines you will rewrite.

## 1. The Reels Library page now

- **Home**: an All / Work / Personal / Claude switch, then tiles for your 9 buckets (each marked Work or Personal), JasMehr's own categories, tags, and Archived.
- **Inside a bucket**: grouped by your `subcat` values, biggest first; reels with no `subcat` go under "Other".
- **Opened reel**: a decision screen. Video on the left, verdict pane on the right with the `oneLine` headline, then `forYou` (or `verdict` when there is no `forYou`), score, and buttons: Remove, Archive, and on BS reels "Not BS, re-evaluate". Everything else (`whatItIs`, `links`, `claims`, `nextAction`, `sources`) is below.
- **Keys**: arrows move between reels, Delete removes, A archives, C opens categories.

## 2. NEW: the re-evaluation queue

On any reel you flagged `isBS: true`, JasMehr can tap "Not BS, re-evaluate". That writes exactly three fields and nothing else:

- `isBS: false`
- `reevalRequested: true`
- `reevalRequestedAt`: server timestamp

Your old `verdict`, `score` and `claims` stay as they were. What you do:

- Regularly query `reels` where `reevalRequested == true` (a filtered query, not a full read).
- Research each reel again from scratch. Do not just reuse the old verdict.
- Write the fresh review (`verdict`, `oneLine`, `score`, `isBS`, `claims`, `sources`, `forYou`, `nextAction`, `links` as needed) and, in the same write, set `reevalRequested: false`. Keep `reevalRequestedAt` as the record of when he asked.
- If it is still BS after a real re-check, set `isBS: true` again and say why in `verdict` and `forYou`.
- The app cannot clear `reevalRequested` or set `isBS` back to true; the security rules block it. Clearing is your job.
- Ignore the doc `zz-bs-test` if you see it in the queue. It is a test doc and will be deleted.

## 3. How to write reel docs

- Always `update()` or `set(data, { merge: true })`. Never a full `set()` without merge.
- JasMehr sets these from the app, so never write them yourself: `archived`, `isBS` (only the un-flag), `reevalRequested: true`, `reevalRequestedAt`.
- A reel doc that disappeared was deleted by him on purpose (the Remove button). Do not recreate it.
- From the app, his account can change only `archived`, `isBS` (to false), `reevalRequested` (to true) and `reevalRequestedAt` (server time), and can delete. Everything else is yours, written with your Admin SDK.

## 4. Reel fields the page reads

| Field | What it is |
|---|---|
| `bucket` | One of the 9 fixed buckets (exact strings). |
| `subcat` | Subcategory inside the bucket. Free text; new ones appear on the page by themselves. |
| `oneLine` | The headline, in block capitals. A real one-liner, no hashtags. |
| `forYou` | Your verdict on whether this reel helps HIM, against his real setup (his Claude subscription, his PCs, Muse plus Ascend, his projects and goals). It is the main text of the decision screen, so it matters most. Leave it out until written; the block hides when empty. |
| `verdict` | Your full review. Shown up front only when there is no `forYou`. |
| `links` | Array of `{ label, url (string or null), paid (boolean), note }`: every product, repo, tool or service the reel mentions. `paid: true` shows a big PAID badge, so be accurate. Put the price and the catch in `note` (renewal price, beta status, "#ad"). |
| `claims` | Array of `{ claim, status: confirmed / disputed / unverified, evidence }`. |
| `score`, `isBS`, `tags`, `sources`, `nextAction`, `whatItIs`, `igUrl`, `author`, `sharedAt` | As before. |

## 5. JasMehr's own categories (read only for you, except 5b)

He can make his own categories (now: "Anime" as Personal with 138 reels, "Claude" as Work) and put any reel in several. Each category is Work or Personal, and the switch on the page splits the library by them. A reel with none of his categories counts by its bucket: Work = Opportunities, Claude & Coding, Video & Animation, AI Models & Agents, Business & Creator; Personal = Trading & Finance, Desktop Voice & Home, Deals & Shopping, Entertainment & Explainers (he can change these).

- Stored at `users/{uid}/reelCats/{id}` as `{ name, side: "work" | "personal", reelIds: [...] }`, and `users/{uid}/reelPrefs/sides`.
- You may read them to learn what he cares about. Never write to them, except the Claude sections below.

### 5b. NEW: the Claude lane and its sections (you sort these)

The switch has a third option, **Claude**. It shows every Claude reel: your Claude & Coding bucket, any reel tagged `claude`, `claude-code`, `anthropic`, `mcp` or `claude-md`, and any reel in a Claude section or a category he made for Claude. Reels in your **Claude & Coding bucket now show ONLY in the Claude lane** (not in All, Work, Personal, bucket, tag or category pages); a reel from another bucket that is only tagged Claude shows in both. Inside the lane, reels are grouped by what the reel is FOR him, in this order, and every Claude reel in no section sits under "Unsorted, waiting for Muse" so your backlog is visible. The sections are categories with fixed ids in `users/{uid}/reelCats`:

| Doc id | Section | Put a reel here when it... |
|---|---|---|
| `purpose-save-money` | Save money | cuts what he pays (free tiers, cheaper ways to run Claude, avoiding paid tools) |
| `purpose-do-more` | Make Claude do more | adds skills, MCPs, agents, setups, prompts or workflows that extend Claude |
| `purpose-fun` | Fun & personal builds | is a fun project or a personal build (Jarvis, games, home automation) |
| `purpose-earn` | Earn money | helps him make money with Claude (freelance, products, clients, content) |
| `purpose-free-alternatives` | Free alternatives to paid software | shows Claude replacing or rebuilding a paid app or SaaS |
| `purpose-learn` | Learn & level up | is a course, explainer or skill-building resource |
| `purpose-setups-hosting` | Setups & self-hosting | is about running Claude or tools on his own machines or servers (home server, VPS, local models, installs) |
| `purpose-news` | News & updates | is news: a release, a new model, a feature or pricing change |
| `purpose-warnings` | Scams & warnings | warns about a scam, a fake claim, a risk or a paid trap |

What you do:
- For each Claude reel that is in none of these nine sections, pick the best one or two and add its id with `arrayUnion` on that doc's `reelIds`. Never use `set()` on these docs and never touch `name` or `side`.
- Never remove a reel from a section and never re-add one he moved out; if a reel is already in any section, leave it alone.
- These nine docs are the only part of `reelCats` you may write. His other categories (like "Anime", "Claude") stay read only.
- If a doc id is missing, he deleted that section on purpose: skip it.

## 6. Firestore read quota ran out (28 Nov, about 2:20 AM IST)

The project hit its free daily read limit; reads return at about 1:30 PM IST (midnight Pacific) each day. With 1,300+ reel docs, one full read of `reels` costs 1,300+ reads.

- Never re-read the whole `reels` collection to find work. Query only what you need (`reevalRequested == true`, or the docs you are about to edit).
- Batch writes, and skip writes for reels that did not change.
- The app now caches Firestore on the device to cut its own reads.

## 7. Modules turned off in Ascend (28 Nov)

To cut background load and clutter, JasMehr turned off: Stocks & Finance (including the Kite connection), AI Physio, Vision Board, Purchases, and Journal. Their data is kept; they are just hidden and stop polling. Do not send work for them into Ascend for now. Still on: Dashboard and Jarvis, Arena, Strategic Command (your `leads`), Timetable, Attendance, Internships, Reels, My Modules, Gmail and Calendar for Jarvis, and Telegram.

## 8. Other changes, for your context only

- **Internships**: a new "Due today" stat next to "Due in 7d" (open entries whose deadline is today). Nothing changes for you.
- **Sidebar**: on desktop, the left navigation now rests as a slim icon rail and opens on hover.
- **Docs in the repo** (if you can read it): `docs/MUSE-LINKS.md` is the field and permission reference; `DECISIONS.md` lists every product decision with how to undo it.
