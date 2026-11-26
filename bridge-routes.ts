/**
 * /api/bridge: the only door the laptop bridge (tools/laptop-bridge) has into Firestore.
 *
 * The laptop holds no Admin SDK key. It proves itself with a long random key; only the
 * key's SHA-256 lives here (or in BRIDGE_KEY_SHA256, which wins), the same scheme as
 * tv-routes.ts. Everything this router touches is under ONE user's tree
 * (users/{BRIDGE_UID}/jobs and users/{BRIDGE_UID}/status/laptop); no request can name
 * another user, collection or document path.
 *
 * Job rules live in bridge-logic.ts. Contract for Muse: docs/MUSE-LINKS.md.
 */
import { Router, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getAdminDb } from './admin-db';
import {
  BRIDGE_ACTION, MAX_VERSIONS, claimLockPath, cleanError, cleanVersion, nextWork, safeHost, safeId,
} from './bridge-logic';

export const bridgeRouter = Router();

const KEY_SHA256 = (process.env.BRIDGE_KEY_SHA256 || '0f29ee7e692b368313c859c1f218ab2969fd7c6813c8fd815f019d8dc897c9fb')
  .trim().toLowerCase();
const UID = (process.env.BRIDGE_UID || 'dBZTvCHfyiPHFLjHxv2ckf37iOr2').trim();
const JOBS = `users/${UID}/jobs`;

function keyOk(key: unknown): boolean {
  if (typeof key !== 'string' || key.length < 32 || key.length > 200) return false;
  const given = createHash('sha256').update(key).digest();
  const want = Buffer.from(KEY_SHA256, 'hex');
  return want.length === given.length && timingSafeEqual(given, want);
}

const now = () => new Date().toISOString();

// Every route below needs the key. A wrong or missing key gets 401 and nothing else.
bridgeRouter.use((req: Request, res: Response, next) => {
  if (!keyOk(req.headers['x-bridge-key'])) {
    res.status(401).json({ error: 'Wrong or missing bridge key.' });
    return;
  }
  next();
});

async function db(res: Response) {
  const d = await getAdminDb();
  if (!d) res.status(503).json({ error: 'Firestore is not configured on the server (FIREBASE_SERVICE_ACCOUNT).' });
  return d;
}

/** Jobs this laptop may act on, each with what it should do next. */
bridgeRouter.get('/jobs', async (req: Request, res: Response) => {
  const host = req.query.host;
  if (!safeHost(host)) { res.status(400).json({ error: 'host must be letters, digits, dot, dash or underscore.' }); return; }
  const d = await db(res); if (!d) return;
  try {
    const snap = await d.collection(JOBS).get();
    const jobs = snap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .map(({ id, data }) => ({ id, work: nextWork(data, host), job: data }))
      .filter((j) => j.work !== null)
      .sort((a, b) => String(a.job.createdAt ?? '').localeCompare(String(b.job.createdAt ?? '')));
    res.json({ jobs });
  } catch (e) {
    res.status(500).json({ error: `Could not list jobs: ${(e as Error).message}` });
  }
});

/** Claim one version of a job. The lock document makes a second claim of the same version fail. */
bridgeRouter.post('/claim', async (req: Request, res: Response) => {
  const { id, host } = (req.body ?? {}) as { id?: unknown; host?: unknown };
  if (!safeId(id) || !safeHost(host)) { res.status(400).json({ error: 'id and host are required.' }); return; }
  const d = await db(res); if (!d) return;
  try {
    const ref = d.doc(`${JOBS}/${id}`);
    const snap = await ref.get();
    if (!snap.exists) { res.status(404).json({ error: 'No such job.' }); return; }
    const work = nextWork(snap.data() ?? {}, host);
    if (!work || (work.kind !== 'render' && work.kind !== 'revise')) {
      res.status(409).json({ error: 'Nothing to claim on this job.', work }); return;
    }
    try {
      const attempt = Number((snap.data() ?? {}).failures) || 0;
      await d.doc(claimLockPath(UID, id, work.version, attempt)).create({ host, at: now() });
    } catch {
      res.status(409).json({ error: `Version ${work.version} of this job is already claimed.` }); return;
    }
    await ref.update({
      status: 'running', stage: 'picked_up', claimedBy: host, claimedAt: now(), updatedAt: now(),
      version: work.version, error: '',
    });
    res.json({ ok: true, work, job: (await ref.get()).data() });
  } catch (e) {
    res.status(500).json({ error: `Claim failed: ${(e as Error).message}` });
  }
});

/** Loads a job this host holds; answers the request itself when it cannot. */
async function heldJob(req: Request, res: Response) {
  const { id, host } = (req.body ?? {}) as { id?: unknown; host?: unknown };
  if (!safeId(id) || !safeHost(host)) { res.status(400).json({ error: 'id and host are required.' }); return null; }
  const d = await db(res); if (!d) return null;
  const ref = d.doc(`${JOBS}/${id}`);
  const snap = await ref.get();
  const data = snap.data() ?? {};
  if (!snap.exists || data.action !== BRIDGE_ACTION) { res.status(404).json({ error: 'No such job.' }); return null; }
  return { ref, data, host };
}

bridgeRouter.post('/building', async (req: Request, res: Response) => {
  const h = await heldJob(req, res); if (!h) return;
  if (h.data.status !== 'running' || h.data.claimedBy !== h.host) { res.status(409).json({ error: 'This laptop does not hold the job.' }); return; }
  await h.ref.update({ stage: 'building', updatedAt: now() });
  res.json({ ok: true });
});

/** A version is in the Outbox: append it and hand the job to Muse for review. */
bridgeRouter.post('/result', async (req: Request, res: Response) => {
  const h = await heldJob(req, res); if (!h) return;
  if (h.data.status !== 'running' || h.data.claimedBy !== h.host) { res.status(409).json({ error: 'This laptop does not hold the job.' }); return; }
  const prior = Array.isArray(h.data.versions) ? h.data.versions : [];
  const v = cleanVersion((req.body ?? {}).version, prior.length + 1);
  if (typeof v === 'string') { res.status(400).json({ error: v }); return; }
  const capped = v.n >= MAX_VERSIONS;
  await h.ref.update({
    // nextStory was used for this version: clear it so a later redo cannot render it twice.
    status: 'awaiting_review', stage: null, versions: [...prior, v], version: v.n, finishedAt: now(), updatedAt: now(),
    nextStory: null,
    error: '',
    summary: `Version ${v.n} is in the ClipForge Outbox (${v.folder}).`
      + (capped ? ` That is the last version this job can make (${MAX_VERSIONS} max).` : ''),
  });
  res.json({ ok: true, version: v });
});

bridgeRouter.post('/fail', async (req: Request, res: Response) => {
  const h = await heldJob(req, res); if (!h) return;
  if (h.data.status !== 'running' || h.data.claimedBy !== h.host) { res.status(409).json({ error: 'This laptop does not hold the job.' }); return; }
  const error = cleanError((req.body ?? {}).error);
  await h.ref.update({
    status: 'failed', stage: null, error, finishedAt: now(), updatedAt: now(),
    // A retry (Muse sets pending or redo again) claims a fresh lock: see claimLockPath.
    failures: (Number(h.data.failures) || 0) + 1,
    summary: 'Failed. See error. To retry, set status back to pending (no version yet) or redo (with notes).',
  });
  res.json({ ok: true });
});

/** A redo that must not render (cap reached, no new notes): back to awaiting_review with the reason. */
bridgeRouter.post('/hold', async (req: Request, res: Response) => {
  const h = await heldJob(req, res); if (!h) return;
  const work = nextWork(h.data, h.host);
  if (!work || work.kind !== 'hold') { res.status(409).json({ error: 'This job is not waiting on a hold.' }); return; }
  await h.ref.update({ status: 'awaiting_review', stage: null, summary: work.reason, updatedAt: now() });
  res.json({ ok: true, reason: work.reason });
});

/** The laptop is on. Muse reads users/{uid}/status/laptop to tell "queued" from "stuck". */
bridgeRouter.post('/heartbeat', async (req: Request, res: Response) => {
  const { host, busy, note } = (req.body ?? {}) as { host?: unknown; busy?: unknown; note?: unknown };
  if (!safeHost(host)) { res.status(400).json({ error: 'host is required.' }); return; }
  const d = await db(res); if (!d) return;
  const summary = typeof note === 'string' ? note.slice(0, 300) : '';
  await d.doc(`users/${UID}/status/laptop`).set({
    project: 'laptop', label: 'Laptop bridge', ok: true,
    summary: summary || (busy ? 'Rendering a job.' : 'On and waiting for jobs.'),
    needsYou: [], numbers: {}, lastRunAt: now(), updatedAt: now(), source: 'laptop-bridge', host,
  });
  res.json({ ok: true });
});

// --- Test jobs -------------------------------------------------------------------------
// Proving the loop needs someone to play Muse. These two routes let the bridge's own
// test command do that, and ONLY for jobs it created itself (requestedBy 'bridge-test'):
// they can never touch, approve or redo a job Muse made.

bridgeRouter.post('/test-job', async (req: Request, res: Response) => {
  const { premise, story } = (req.body ?? {}) as { premise?: unknown; story?: unknown };
  const args: Record<string, unknown> = {};
  if (typeof premise === 'string' && premise.trim()) args.premise = premise.trim().slice(0, 300);
  else if (story && typeof story === 'object') args.story = story;
  else { res.status(400).json({ error: 'Give a premise or a story.' }); return; }
  const d = await db(res); if (!d) return;
  const ref = await d.collection(JOBS).add({
    action: BRIDGE_ACTION, args, status: 'pending', stage: null, requestedBy: 'bridge-test',
    note: 'Test job made by the laptop bridge.', notes: '', version: 0, versions: [], claimedBy: null,
    createdAt: now(), claimedAt: null, finishedAt: null, updatedAt: now(), summary: '', error: '', result: {},
  });
  res.json({ ok: true, id: ref.id });
});

bridgeRouter.post('/test-review', async (req: Request, res: Response) => {
  const { id, status, notes, nextStory } = (req.body ?? {}) as { id?: unknown; status?: unknown; notes?: unknown; nextStory?: unknown };
  if (!safeId(id) || (status !== 'redo' && status !== 'approved')) {
    res.status(400).json({ error: "id and status ('redo' or 'approved') are required." }); return;
  }
  const d = await db(res); if (!d) return;
  const ref = d.doc(`${JOBS}/${id}`);
  const snap = await ref.get();
  const data = snap.data() ?? {};
  if (!snap.exists || data.requestedBy !== 'bridge-test') { res.status(403).json({ error: 'Only test jobs can be reviewed this way.' }); return; }
  if (data.status !== 'awaiting_review' && data.status !== 'failed') {
    res.status(409).json({ error: 'The job is not awaiting review or failed.' }); return;
  }
  await ref.update({
    status, notes: typeof notes === 'string' ? notes.slice(0, 5000) : '', updatedAt: now(),
    nextStory: status === 'redo' && nextStory && typeof nextStory === 'object' ? nextStory : null,
  });
  res.json({ ok: true });
});

/** Read one job (for the test command and the proof). Only this user's jobs. */
bridgeRouter.get('/job/:id', async (req: Request, res: Response) => {
  if (!safeId(req.params.id)) { res.status(400).json({ error: 'Bad id.' }); return; }
  const d = await db(res); if (!d) return;
  const snap = await d.doc(`${JOBS}/${req.params.id}`).get();
  if (!snap.exists) { res.status(404).json({ error: 'No such job.' }); return; }
  res.json({ id: req.params.id, job: snap.data() });
});
