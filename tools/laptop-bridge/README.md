# Laptop bridge

Picks up Blocky video jobs that Muse leaves in Firestore, renders them with ClipForge on
this laptop, and puts each version plus a review pack in the **ClipForge Outbox** folder
for Muse to review. Muse answers `redo` (with notes) or `approved`. Nothing is ever posted.

Job states, fields and the rules Muse follows: [docs/MUSE-LINKS.md](../../docs/MUSE-LINKS.md).
Server side: `bridge-routes.ts` and `bridge-logic.ts` at the repo root.

## Start, stop, logs

| | |
|---|---|
| Start | double-click `Start Bridge.bat` (or `python bridge.py run`) |
| Stop | double-click `Stop Bridge.bat` (or `python bridge.py stop`). It stops after the render in progress. |
| Start at login | run `install-autostart.ps1` once (PowerShell). Remove with `install-autostart.ps1 -Remove`. |
| Logs | `logs\bridge.log` (every claim, state change and failure), `logs\render-<job>-v<n>.log` (ClipForge's own output) |

Needs any Python 3.11+ on PATH (standard library only) and ClipForge at
`E:\imp\projects\clipforge` with its `.venv`.

## The key

`.bridge-key` (never committed) holds a long random key. Ascend stores only its SHA-256
(`bridge-routes.ts`, or the `BRIDGE_KEY_SHA256` env var, which wins). To rotate it: write
a new key into `.bridge-key`, put its SHA-256 in `BRIDGE_KEY_SHA256` on Vercel, redeploy.
The laptop holds no Firebase Admin key; the key opens only `/api/bridge`, which only
touches JasMehr's own `jobs` and `status/laptop` documents.

## Settings: bridge.config.json (optional, never committed)

```json
{ "outbox_dir": "G:\\My Drive\\ClipForge Outbox" }
```

Leave `outbox_dir` out to find Google Drive for Desktop's `My Drive\ClipForge Outbox` on
any drive letter. If the folder is missing, a job fails with that reason; nothing is left
in a random local folder. Other keys and their defaults are at the top of `bridge.py`.

## What it will and will not do

- Runs only `clipforge\blocky.py`, with one of three argument shapes (`build_args`):
  `--story-file`, `--premise`, or `--story-file ... --revise-notes ...`. Nothing in a job
  document becomes a command.
- One render at a time. No new render from 1:00 AM until the 1:30 AM ClipForge Nightly run
  has started, and none while it runs (`cache\nightly.running`). The nightly run waits while
  a bridge render holds `cache\bridge-render.lock`.
- A version is claimed with a lock document, so two laptops cannot render the same version.
- Redo: one new version per new notes; 3 versions per job at most.
- Heartbeat every 5 minutes to `users/{uid}/status/laptop`, so Muse can tell "laptop off"
  from "stuck". Jobs made while the laptop is off wait as `pending`.
- If the bridge is stopped mid-render, the next start marks that job `failed` with the reason.

## Testing the loop yourself

```
python bridge.py test-job --premise "In this town, every time you lie, a brick falls off your body."
python bridge.py once                      # renders version 1
python bridge.py show <id>                 # awaiting_review, versions[0]
python bridge.py test-review <id> redo --notes "Make the ending slower"
python bridge.py once                      # version 2
python bridge.py test-review <id> approved
python -m unittest test_bridge             # pure checks
```

`test-job` and `test-review` work only on jobs the bridge made itself
(`requestedBy: bridge-test`); they cannot touch a job Muse created.
