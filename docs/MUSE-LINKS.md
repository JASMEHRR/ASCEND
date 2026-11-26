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

`args` is either `{ "premise": "In this town, ..." }` (ClipForge writes the story) or
`{ "story": <story> }` in ClipForge Blocky's story format (`schemas.BLOCKY_STORY` in the
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

- Set `status: "redo"` and write the review in `notes`. One redo makes one new version.
- Notes the last version already answered do not render again.
- A job makes at most **3 versions**. After that a redo returns to `awaiting_review` with
  "Version cap reached" in `summary`, and JasMehr decides.
- `approved` never posts. JasMehr's own approve in ClipForge is the final step.

### When a job fails

`error` holds the real reason. If it says the AI story writer was busy (503, 429,
"high demand"), nothing is wrong with the story: set `status` back to `pending` (if no
version was made yet) or `redo` (with the same or new notes) and the laptop tries again.
A failed version never counts toward the 3-version cap.
