"""Laptop bridge: turns Blocky video jobs from Muse into ClipForge renders and back.

    python bridge.py run                 # keep running: poll for jobs, heartbeat, render
    python bridge.py once                # one pass, then exit (handy to watch a test)
    python bridge.py stop                # ask a running bridge to stop (after its current render)
    python bridge.py test-job --story s.json | --premise "In this town, ..."
    python bridge.py test-review <job id> redo --notes "..." | approved
    python bridge.py show <job id>       # print the job document

It talks only to Ascend's /api/bridge with the key in .bridge-key (never an Admin SDK
key), and the only thing it can run is ClipForge's blocky.py with checked arguments.
Nothing from a job document ever becomes a shell command. Standard library only.
Logs: logs/bridge.log (and logs/render-<job>-v<n>.log per render). See README.md.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import logging.handlers
import math
import os
import re
import shutil
import socket
import subprocess  # nosec B404 - fixed argv lists, never a shell
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEY_FILE = HERE / ".bridge-key"
CONFIG_FILE = HERE / "bridge.config.json"
LOG_DIR = HERE / "logs"
WORK_DIR = HERE / "work"
STOP_FILE = HERE / "STOP"
PID_FILE = WORK_DIR / "bridge.pid"

DEFAULTS = {
    "api": "https://ascend-delta-sage.vercel.app/api/bridge",
    "clipforge_dir": r"E:\imp\projects\clipforge",
    # "" = find Google Drive for Desktop's "My Drive\ClipForge Outbox" on any drive letter.
    "outbox_dir": "",
    "host": "",
    "poll_seconds": 30,
    "heartbeat_seconds": 300,
    "render_timeout_seconds": 3 * 3600,
    # No new render from 01:00 until the 01:30 ClipForge Nightly run has started.
    "nightly_quiet_start": "01:00",
    "nightly_start": "01:30",
}
OUTBOX_NAME = "ClipForge Outbox"
DONE_LINE = re.compile(r"^\[\d+/\d+\] (\w+): (.+)$")
# A render that failed because the AI writer was overloaded, not because the story is wrong.
BUSY = re.compile(r"\b(503|429|UNAVAILABLE|high demand|rate.?limit|DEADLINE_EXCEEDED|timed out)\b", re.I)

log = logging.getLogger("bridge")


class BridgeError(Exception):
    """A failure with a message fit to write into the job's error field."""


# ------------------------------------------------------------------ setup

def setup_logging() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S")
    fh = logging.handlers.RotatingFileHandler(LOG_DIR / "bridge.log", maxBytes=2_000_000,
                                              backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    log.addHandler(fh)
    if sys.stdout is not None:  # pythonw has no console
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        log.addHandler(sh)
    log.setLevel(logging.INFO)


def load_config() -> dict:
    cfg = dict(DEFAULTS)
    if CONFIG_FILE.exists():
        try:
            cfg.update(json.loads(CONFIG_FILE.read_text(encoding="utf-8")))
        except (OSError, ValueError) as e:
            raise SystemExit(f"bridge.config.json is not valid JSON: {e}") from e
    cfg["host"] = cfg["host"] or re.sub(r"[^A-Za-z0-9._-]", "-", socket.gethostname())[:64]
    return cfg


def load_key() -> str:
    try:
        key = KEY_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError as e:
        raise SystemExit(f"No bridge key at {KEY_FILE}. See README.md, 'The key'.") from e
    if len(key) < 32:
        raise SystemExit(f"The key in {KEY_FILE} is too short to be the bridge key.")
    return key


# ------------------------------------------------------------------ API

class Api:
    def __init__(self, base: str, key: str):
        self.base = base.rstrip("/")
        self.key = key

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={
            "x-bridge-key": self.key, "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:  # nosec B310 - fixed https base
                return json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            try:
                msg = json.loads(text).get("error", text)
            except ValueError:
                msg = text
            raise BridgeError(f"Ascend answered {e.code} on {method} {path}: {msg}") from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise BridgeError(f"Could not reach Ascend ({method} {path}): {e}") from e


# ------------------------------------------------------------------ pure helpers

def parse_hhmm(s: str) -> dt.time:
    h, m = s.split(":")
    return dt.time(int(h), int(m))


def in_nightly_quiet(now: dt.datetime, start: str, end: str) -> bool:
    """Pure. True between quiet start and the nightly start (same night)."""
    t = now.time()
    return parse_hhmm(start) <= t < parse_hhmm(end)


def shot_times(timeline: dict) -> list[tuple[float, float]]:
    """Pure. (start, end) of each narrated line (one line = one shot)."""
    lines = timeline.get("lines") or []
    total = float(timeline.get("total") or 0)
    starts = [float(ln["start"]) for ln in lines]
    ends = starts[1:] + [total]
    return list(zip(starts, ends))


def find_outbox(configured: str) -> Path | None:
    """The Outbox folder, or None. Configured path wins; otherwise Google Drive for
    Desktop's 'My Drive' on any drive letter."""
    if configured:
        p = Path(configured)
        return p if p.is_dir() else None
    for letter in "GHIJKLMNOPQRSTUVWXYZDEF":
        p = Path(f"{letter}:/My Drive/{OUTBOX_NAME}")
        if p.is_dir():
            return p
    return None


def narration_text(story: dict, times: list[tuple[float, float]]) -> str:
    shots = story.get("shots") or []
    out = [f"{story.get('title', '')}", ""]
    for i, s in enumerate(shots, 1):
        t = times[i - 1][0] if i - 1 < len(times) else 0.0
        out.append(f"{i:02d}  {t:6.2f}s  {s.get('text', '')}")
    return "\n".join(out) + "\n"


# ------------------------------------------------------------------ ClipForge

class Renderer:
    def __init__(self, cfg: dict):
        self.cf = Path(cfg["clipforge_dir"])
        self.python = self.cf / ".venv" / "Scripts" / "python.exe"
        self.timeout = int(cfg["render_timeout_seconds"])
        self.lock = self.cf / "cache" / "bridge-render.lock"
        self.nightly_flag = self.cf / "cache" / "nightly.running"
        local_ff = self.cf / "tools" / "ffmpeg-7.1" / "bin" / "ffmpeg.exe"
        self.ffmpeg = str(local_ff) if local_ff.exists() else (shutil.which("ffmpeg") or "ffmpeg")

    def nightly_running(self) -> bool:
        if not self.nightly_flag.exists():
            return False
        age_h = (time.time() - self.nightly_flag.stat().st_mtime) / 3600
        return age_h < 6  # an older flag is a crashed nightly run, not a running one

    def render(self, job_id: str, n: int, args: list[str]) -> Path:
        """Runs blocky.py with `args` (built only by build_args) and returns its job folder."""
        if not self.python.exists():
            raise BridgeError(f"ClipForge's Python was not found at {self.python}")
        argv = [str(self.python), "blocky.py", *args]
        render_log = LOG_DIR / f"render-{job_id}-v{n}.log"
        log.info("render start job=%s v%d: blocky.py %s", job_id, n,
                 " ".join(a if len(a) < 60 else a[:57] + "..." for a in args))
        self.lock.parent.mkdir(parents=True, exist_ok=True)
        self.lock.write_text(f"{os.getpid()} {job_id} v{n}", encoding="utf-8")
        try:
            with open(render_log, "w", encoding="utf-8") as fh:
                proc = subprocess.run(argv, cwd=self.cf, stdout=fh, stderr=subprocess.STDOUT,  # nosec B603
                                      env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                                      timeout=self.timeout, check=False)
        except subprocess.TimeoutExpired as e:
            raise BridgeError(f"ClipForge took longer than {self.timeout // 60} minutes and was stopped") from e
        except OSError as e:
            raise BridgeError(f"Could not start ClipForge: {e}") from e
        finally:
            self.lock.unlink(missing_ok=True)
        text = render_log.read_text(encoding="utf-8", errors="replace")
        m = None
        for line in text.splitlines():
            m = DONE_LINE.match(line.strip()) or m
        if not m:
            tail = " | ".join(text.strip().splitlines()[-5:])
            raise BridgeError(f"ClipForge exited ({proc.returncode}) without making a video: {tail[:1500]}")
        status, job_dir = m.group(1), Path(m.group(2).strip())
        if status != "done":
            raise BridgeError(self._failure_reason(job_dir))
        log.info("render done job=%s v%d -> %s", job_id, n, job_dir)
        return job_dir

    @staticmethod
    def _failure_reason(job_dir: Path) -> str:
        try:
            notes = json.loads((job_dir / "job.json").read_text(encoding="utf-8")).get("notes") or []
        except (OSError, ValueError):
            notes = []
        failed = [str(n) for n in notes if str(n).startswith("job failed")]
        reason = (failed[-1] if failed else "ClipForge reported the video as failed") + f" (folder {job_dir})"
        reason = re.sub(r"\s*[–—�]\s*", ": ", reason)  # ClipForge's dashes, or their mangled form
        if BUSY.search(reason):
            reason = ("The AI story writer was busy, not a broken story. Set the job back to redo "
                      "(or pending) to try again. Details: " + reason)
        return reason

    def frame(self, video: Path, t: float, out: Path) -> None:
        self._ff(["-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1",
                  "-vf", "scale=540:-2", "-q:v", "3", str(out)], f"frame at {t:.2f}s")

    def sheet(self, frames_dir: Path, count: int, out: Path) -> None:
        cols = 6
        rows = math.ceil(count / cols)
        self._ff(["-framerate", "1", "-i", str(frames_dir / "shot_%02d.jpg"),
                  "-vf", f"scale=270:-2,tile={cols}x{rows}:padding=6:margin=6:color=white",
                  "-frames:v", "1", "-q:v", "3", str(out)], "frame sheet")

    def _ff(self, args: list[str], what: str) -> None:
        try:
            p = subprocess.run([self.ffmpeg, "-y", "-loglevel", "error", *args],  # nosec B603
                               capture_output=True, text=True, timeout=300, check=False)
        except (OSError, subprocess.TimeoutExpired) as e:
            raise BridgeError(f"ffmpeg could not make the {what}: {e}") from e
        if p.returncode != 0:
            raise BridgeError(f"ffmpeg could not make the {what}: {p.stderr.strip()[-500:]}")


def build_args(work: dict, job: dict, input_story: Path | None) -> list[str]:
    """Pure-ish. The ONLY argument lists the bridge ever passes to blocky.py."""
    if work["kind"] == "revise":
        if work.get("withStory"):
            return ["--story-file", str(input_story)]  # Muse wrote the next version itself
        notes = str(work["notes"])[:3000]
        return ["--story-file", str(input_story), "--revise-notes", notes]
    args = job.get("args") or {}
    if isinstance(args.get("story"), dict):
        return ["--story-file", str(input_story)]
    premise = args.get("premise")
    if isinstance(premise, str) and premise.strip():
        return ["--premise", premise.strip()[:300]]
    raise BridgeError("The job has neither args.story (a Blocky story) nor args.premise")


# ------------------------------------------------------------------ one job

def review_pack(r: Renderer, job_dir: Path, dest: Path) -> dict:
    """Copies the video, story and narration into `dest` and draws one frame per shot."""
    record = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    clips = record.get("clips") or []
    if not clips:
        raise BridgeError(f"ClipForge finished but listed no video in {job_dir / 'job.json'}")
    video = Path(clips[0]["path"])
    timeline = json.loads((job_dir / "timeline.json").read_text(encoding="utf-8"))
    raw_story = job_dir / "story_raw.json"
    clean = json.loads((job_dir / "story.json").read_text(encoding="utf-8"))
    times = shot_times(timeline)
    if not times:
        raise BridgeError("The render has no shot timings (timeline.json is empty)")
    dest.mkdir(parents=True, exist_ok=True)
    frames_dir = dest  # shot_01.jpg ... sit next to the video, so every name is a plain file name
    shutil.copy2(video, dest / "video.mp4")
    shutil.copy2(raw_story if raw_story.exists() else job_dir / "story.json", dest / "story.json")
    (dest / "narration.txt").write_text(narration_text(clean, times), encoding="utf-8")
    names = []
    for i, (a, b) in enumerate(times, 1):
        name = f"shot_{i:02d}.jpg"
        r.frame(dest / "video.mp4", (a + b) / 2, frames_dir / name)
        names.append(name)
    r.sheet(frames_dir, len(names), dest / "frames.jpg")
    return {"durationS": round(float(timeline.get("total") or clips[0].get("duration") or 0), 2),
            "shots": len(names), "frames": names}


def handle(api: Api, cfg: dict, r: Renderer, job_id: str, job: dict, work: dict) -> None:
    host = cfg["host"]
    if work["kind"] == "recover":
        msg = "The laptop bridge stopped while this version was rendering (restart or crash). Create the job again to retry."
        log.warning("job %s: %s", job_id, msg)
        api.call("POST", "/fail", {"id": job_id, "host": host, "error": msg})
        return
    if work["kind"] == "hold":
        api.call("POST", "/hold", {"id": job_id, "host": host})
        log.info("job %s: redo held: %s", job_id, work["reason"])
        return

    claim = api.call("POST", "/claim", {"id": job_id, "host": host})
    n = int(claim["work"]["version"])
    log.info("job %s: claimed version %d (status running, stage picked_up)", job_id, n)
    try:
        outbox = find_outbox(cfg["outbox_dir"])
        if outbox is None:
            where = cfg["outbox_dir"] or f"<any drive>:/My Drive/{OUTBOX_NAME}"
            raise BridgeError(f'The "{OUTBOX_NAME}" folder was not found ({where}). Install Google Drive '
                              f'for Desktop and create the folder, then create the job again.')
        work_dir = WORK_DIR / job_id / f"v{n}"
        work_dir.mkdir(parents=True, exist_ok=True)
        input_story = None
        if work["kind"] == "revise" and work.get("withStory"):
            story = job.get("nextStory")
            if not isinstance(story, dict):
                raise BridgeError("The redo says it has a story from Muse, but nextStory is missing")
            input_story = work_dir / "input_story.json"
            input_story.write_text(json.dumps(story, indent=2), encoding="utf-8")
        elif work["kind"] == "revise":
            prev = outbox / job_id / f"v{n - 1}" / "story.json"
            if not prev.exists():
                raise BridgeError(f"The story of version {n - 1} is missing from the Outbox ({prev})")
            input_story = work_dir / "input_story.json"
            shutil.copy2(prev, input_story)
        elif isinstance((job.get("args") or {}).get("story"), dict):
            input_story = work_dir / "input_story.json"
            input_story.write_text(json.dumps(job["args"]["story"], indent=2), encoding="utf-8")
        args = build_args(work, job, input_story)
        api.call("POST", "/building", {"id": job_id, "host": host})
        log.info("job %s: building version %d", job_id, n)
        job_dir = r.render(job_id, n, args)
        folder = f"{job_id}/v{n}"
        pack = review_pack(r, job_dir, outbox / job_id / f"v{n}")
        version = {
            "n": n, "notes": work.get("notes", "") if work["kind"] == "revise" else "", "folder": folder,
            "files": {"video": "video.mp4", "frameSheet": "frames.jpg", "frames": pack["frames"],
                      "narration": "narration.txt", "story": "story.json"},
            "durationS": pack["durationS"], "shots": pack["shots"],
            "madeAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        api.call("POST", "/result", {"id": job_id, "host": host, "version": version})
        log.info("job %s: version %d awaiting review in %s/%s (%d shots, %.1fs)", job_id, n,
                 OUTBOX_NAME, folder, pack["shots"], pack["durationS"])
    except BridgeError as e:
        log.error("job %s: failed: %s", job_id, e)
        api.call("POST", "/fail", {"id": job_id, "host": host, "error": str(e)})
    except Exception as e:  # noqa: BLE001 - never fail silently: the job must carry the error
        log.exception("job %s: unexpected failure", job_id)
        api.call("POST", "/fail", {"id": job_id, "host": host, "error": f"{type(e).__name__}: {e}"})


# ------------------------------------------------------------------ loop

def one_pass(api: Api, cfg: dict, r: Renderer) -> int:
    """Handles every job that needs this laptop. Returns how many were handled."""
    jobs = api.call("GET", f"/jobs?host={cfg['host']}")["jobs"]
    handled = 0
    for item in jobs:
        work = item["work"]
        if work["kind"] in ("render", "revise"):
            now = dt.datetime.now()
            if in_nightly_quiet(now, cfg["nightly_quiet_start"], cfg["nightly_start"]) or r.nightly_running():
                log.info("job %s waits: the ClipForge Nightly run is due or running", item["id"])
                continue
        try:
            handle(api, cfg, r, item["id"], item["job"], work)
            handled += 1
        except BridgeError as e:
            log.error("job %s: %s", item["id"], e)
        if STOP_FILE.exists():
            break
    return handled


def heartbeat(api: Api, cfg: dict, note: str = "") -> None:
    try:
        api.call("POST", "/heartbeat", {"host": cfg["host"], "note": note})
    except BridgeError as e:
        log.warning("heartbeat failed: %s", e)


def already_running() -> bool:
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return False
    if pid == os.getpid():
        return False
    out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"],  # nosec B603 B607
                         capture_output=True, text=True, check=False).stdout
    return str(pid) in out and "python" in out.lower()


def run(api: Api, cfg: dict) -> int:
    WORK_DIR.mkdir(exist_ok=True)
    if already_running():
        log.info("another bridge is already running (pid file %s); exiting", PID_FILE)
        return 0
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    STOP_FILE.unlink(missing_ok=True)
    r = Renderer(cfg)
    log.info("bridge started on %s (api %s, clipforge %s, outbox %s)", cfg["host"], cfg["api"],
             cfg["clipforge_dir"], find_outbox(cfg["outbox_dir"]) or "NOT FOUND")
    last_beat = 0.0
    try:
        while not STOP_FILE.exists():
            if time.time() - last_beat >= int(cfg["heartbeat_seconds"]):
                heartbeat(api, cfg)
                last_beat = time.time()
            try:
                one_pass(api, cfg, r)
            except BridgeError as e:
                log.warning("poll failed: %s", e)
            for _ in range(int(cfg["poll_seconds"])):
                if STOP_FILE.exists():
                    break
                time.sleep(1)
    except KeyboardInterrupt:
        log.info("stopped with Ctrl+C")
    finally:
        heartbeat(api, cfg, "Bridge stopped.")
        PID_FILE.unlink(missing_ok=True)
        STOP_FILE.unlink(missing_ok=True)
        log.info("bridge stopped")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Laptop bridge: Blocky jobs from Muse to ClipForge")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run")
    sub.add_parser("once")
    sub.add_parser("stop")
    t = sub.add_parser("test-job")
    g = t.add_mutually_exclusive_group(required=True)
    g.add_argument("--story", help="a Blocky story JSON file")
    g.add_argument("--premise")
    rv = sub.add_parser("test-review")
    rv.add_argument("id")
    rv.add_argument("status", choices=["redo", "approved"])
    rv.add_argument("--notes", default="")
    rv.add_argument("--story", help="redo only: Muse's full next-version story (JSON file)")
    sh = sub.add_parser("show")
    sh.add_argument("id")
    a = ap.parse_args(argv)

    if a.cmd == "stop":
        STOP_FILE.write_text("stop", encoding="utf-8")
        print("Asked the bridge to stop. It stops after the current render, if any.")
        return 0
    setup_logging()
    cfg = load_config()
    api = Api(cfg["api"], load_key())
    if a.cmd == "run":
        return run(api, cfg)
    if a.cmd == "once":
        heartbeat(api, cfg)
        log.info("once: handled %d job(s)", one_pass(api, cfg, Renderer(cfg)))
        return 0
    if a.cmd == "test-job":
        body = ({"story": json.loads(Path(a.story).read_text(encoding="utf-8"))} if a.story
                else {"premise": a.premise})
        out = api.call("POST", "/test-job", body)
        log.info("test job created: %s", out["id"])
        print(out["id"])
        return 0
    if a.cmd == "test-review":
        body = {"id": a.id, "status": a.status, "notes": a.notes}
        if a.story:
            body["nextStory"] = json.loads(Path(a.story).read_text(encoding="utf-8"))
        api.call("POST", "/test-review", body)
        log.info("test review: job %s set to %s%s", a.id, a.status, f" with notes: {a.notes}" if a.notes else "")
        return 0
    if a.cmd == "show":
        print(json.dumps(api.call("GET", f"/job/{a.id}"), indent=2))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
