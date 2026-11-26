# Muse links: how Muse, Ascend and the laptop talk

Firestore is the only meeting point. Everything lives under JasMehr's own user:
`users/dBZTvCHfyiPHFLjHxv2ckf37iOr2` in project `ascend-57d4e`.

| Who | Writes with | May write |
|---|---|---|
| Muse | its own Admin SDK key | `jobs/*` (create, redo, approve, cancel), `status/muse`, `internships/*`, `leads/*` |
| Laptop bridge | `/api/bridge` with the bridge key (no Admin key on the laptop) | its claim and result on `jobs/*`, `status/laptop` |
| Ascend app (browser) | JasMehr's sign-in | reads `jobs` and `status`; writes neither |

Types: `src/features/muse/types.ts`. Rules for the laptop: `bridge-logic.ts`.

## Laptop jobs (v1: Blocky videos only)

Path: `users/{uid}/jobs/{jobId}`. The only action the laptop runs is `clipforge.blocky`.

### Muse creates a job

```json
{
  "action": "clipforge.blocky",
  "args": { "story": { "title": "...", "premise": "...", "description": "...", "hashtags": ["#InThisTown"], "cast": [ ... ], "shots": [ ... ] } },
  "status": "pending",
  "stage": null,
  "requestedBy": "muse",
  "note": "why this video",
  "notes": "",
  "version": 0,
  "versions": [],
  "claimedBy": null,
  "createdAt": "<ISO time>", "claimedAt": null, "finishedAt": null, "updatedAt": "<ISO time>",
  "summary": "", "error": "", "result": {}
}
```

**Muse writes the story.** Send `{ "story": <story> }` in ClipForge Blocky's story format.
(`{ "premise": "In this town, ..." }` also works, but then the laptop's free AI writers
write the story, and they are often busy or too short.) The story format (`schemas.BLOCKY_STORY` in the
clipforge repo): title, premise, description, hashtags, cast (2 to 5), shots (20 to 32,
one sentence each, only the places, cameras, actions, faces, props and sfx Blocky can draw).
A story that does not match fails the job with the validator's message in `error`.

### What happens next

| status | stage | Set by | Meaning |
|---|---|---|---|
| `pending` | | Muse | Queued. Waits here while the laptop is off. |
| `running` | `picked_up` | bridge | A laptop claimed it. |
| `running` | `building` | bridge | ClipForge is rendering. |
| `awaiting_review` | | bridge | A version is in the Outbox. Review it. |
| `redo` | | Muse | Make the next version; put the review in `notes`. |
| `approved` | | Muse | Ready for JasMehr. The loop ends. Nothing is posted. |
| `failed` | | bridge | `error` holds the real reason. |
| `cancelled` | | Muse | Stop. |

Is the laptop on? Read `users/{uid}/status/laptop`: `updatedAt` is refreshed every 5 minutes
while the bridge runs.

### Reviewing a version

Each version is appended to `versions` and its files are in the Google Drive folder
**ClipForge Outbox**, under `versions[i].folder` (`<jobId>/v<n>`):

- `files.video`: the mp4
- `files.frameSheet`: every shot on one image, in order
- `files.frames`: one image per shot (`shot_01.jpg` ...), the middle of each shot
- `files.narration`: numbered narration, one line per shot, with start times
- `files.story`: the exact story JSON that was rendered

Review from the frames and the narration (no need to play the mp4).

### Redo rules

- Set `status: "redo"`, write the review in `notes`, and put the **full next version of the
  story in `nextStory`** (same format as `args.story`). The laptop renders it exactly as
  written, with no AI on the laptop. `nextStory` is cleared once that version is made.
- Notes alone (no `nextStory`) also work: the laptop's AI then rewrites the story from the
  notes, which is slower and can fail when the free AI writers are busy.
- One redo makes one new version.
- Notes the last version already answered do not render again.
- A job makes at most **3 versions**. After that a redo returns to `awaiting_review` with
  "Version cap reached" in `summary`, and JasMehr decides.
- `approved` never posts. JasMehr's own approve in ClipForge is the final step.

### When a job fails

`error` holds the real reason. If it says the AI story writer was busy (503, 429,
"high demand"), nothing is wrong with the story: set `status` back to `pending` (if no
version was made yet) or `redo` (with the same or new notes) and the laptop tries again.
A failed version never counts toward the 3-version cap.

## Writing a Blocky story (exact format)

The validator only checks the shape below. Any **value not in these lists is silently swapped**
for a default (a wrong place becomes `street`, a wrong action `idle`), so use these words exactly.

**Top level**: `title` (max 60 chars, no emoji), `premise` (the rule, max 160), `description`
(2 sentences), `hashtags` (8 to 12, like `#InThisTown`), `cast` (2 to 5), `shots` (20 to 32).

**Cast member**: `id` (lowercase, the hero is `me`), `name`, `shape`, `shirt`, `pants`, `skin`,
`hair`, `hair_color`, `size`, `extras` (0 to 3).

| Field | Allowed values |
|---|---|
| shape | person, house, car, phone, fridge, tree, cake, dog, cat (objects get a face, arms and legs) |
| shirt, pants, hair_color | red, blue, green, yellow, orange, purple, pink, white, black, brown, grey, teal, navy, gold, lime, cyan |
| skin | yellow, light, tan, brown, dark |
| hair | none, short, long, bun, spiky, cap, tophat, crown, bow |
| extras | glasses, mustache, blush, tie |
| size | baby, kid, adult, giant |

**Shot**: `text` (ONE sentence, 6 to 12 words, numbers as words), `place`, `camera`, `focus`
(a cast id in the shot, `group`, or `sign`), `actors` (1 to 4: `id`, `action`, `face`, `prop`),
`sfx`, `emphasis` (0 or 1 word copied exactly from `text`), `sign` (`""` or max 24 chars).

| Field | Allowed values |
|---|---|
| place | street, house, school, park, shop, city, room, classroom, kitchen |
| camera | player, wide, push_in, close_up, orbit, low_angle, top_down, pan, shake, whip, reveal |
| action | idle, walk, run, sneak, jump, celebrate, wave, dance, shock, cry, fall, spin, point, sit, shrink, grow, float, talk, lose_part |
| face | neutral, smile, grin, laugh, shock, sad, angry, worried, smug, cry, love, cool, ko |
| prop | none, phone, pizza, book, money, gift, ball, trophy, icecream, burger |
| sfx | none, pop, whoosh, ding, riser |

**What makes it work** (ClipForge's own writer rules):
- First person; the hero is `me` and is in shot 1. Shot 1's text is the hook, under 14 words.
- Total narration 180 to 280 words. 2 to 4 places, staying in each for several shots.
- `player` or `wide` camera for about half the shots; `close_up` at most one shot in seven and
  never twice in a row; never the same camera twice in a row; `top_down` or `player` for shot 1.
- Two or more actors in at least half the shots. Use `giant` and `baby` sizes boldly together.
- One recurring side character; a problem, three failed tries, a twist; the last shot is a
  question that makes people comment. No brand names, no real people, nothing scary or mean.
- Never use Roblox's name, logo or characters anywhere.

One cast member and one shot, for the shape only:

```json
{"id": "me", "name": "Milo", "shape": "person", "shirt": "red", "pants": "navy", "skin": "yellow", "hair": "short", "hair_color": "brown", "size": "kid", "extras": []}
{"text": "My mom is the tallest lady in town.", "place": "street", "camera": "low_angle", "focus": "mom", "actors": [{"id": "mom", "action": "wave", "face": "smile", "prop": "none"}, {"id": "me", "action": "idle", "face": "smile", "prop": "book"}], "sfx": "none", "emphasis": ["tallest"], "sign": ""}
```

A full example with every value valid (26 shots, 237 words, about 52 s): `docs/blocky-example-story.json`.

## Internships due today

An internship is **due today** when its `status` is `to-review` or `apply-queue` and the date
in `deadlineText` is today (IST). Ascend shows these in a **Due today** section at the top of
the Internships page.

Every morning, the first Ascend cron pass after 7 AM IST writes one task to
`users/{uid}/coach-inbox/due-today-<YYYY-MM-DD>` (`channel: "ascend-cron"`,
`task: "internships-due-today"`) when anything is due. JasMehr can also send the same task
from the page with **Muse, send me this**.

When Muse picks it up:

1. Send JasMehr the list in `text`, one line per internship, with its link.
2. Apply to the ones in `apply-queue` before the deadline if you can; say which ones need him.
3. Close the doc (`status: "processed"`) as with any other coach-inbox task.
