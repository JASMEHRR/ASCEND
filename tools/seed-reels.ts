/**
 * Writes the sample reels (src/features/reels/seedReels.ts) into
 * users/{uid}/reels, or removes them with --remove.
 *
 *   npx tsx tools/seed-reels.ts            write the samples
 *   npx tsx tools/seed-reels.ts --remove   delete every sample-* doc
 *   npx tsx tools/seed-reels.ts --add-test add one more doc (live-update check)
 *
 * Auth, with no key ever pasted anywhere: the Firebase CLI's own login
 * (run `npx firebase-tools login` once). The token is refreshed by running a
 * harmless CLI command, then read from the CLI's config file. Writes go
 * through the Firestore REST API as the project owner, so rules don't apply,
 * exactly like Muse's Admin SDK writes.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SEED_REELS } from '../src/features/reels/seedReels';

const PROJECT = 'ascend-57d4e';
const UID = (process.env.ASCEND_UID || 'dBZTvCHfyiPHFLjHxv2ckf37iOr2').trim();
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${UID}/reels`;

function cliToken(): string {
  execSync('npx -y firebase-tools projects:list', { stdio: 'ignore' });
  const cfg = JSON.parse(readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8')) as {
    tokens?: { access_token?: string };
  };
  const t = cfg.tokens?.access_token;
  if (!t) throw new Error('No Firebase CLI login found. Run: npx firebase-tools login');
  return t;
}

type FsValue = Record<string, unknown>;
function toValue(v: unknown, key = ''): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (key === 'sharedAt' && typeof v === 'string') return { timestampValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => toValue(x)) } };
  return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
}
const toFields = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v, k)]));

async function call(token: string, method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
}

async function main() {
  const token = cliToken();
  const mode = process.argv[2];
  if (mode === '--remove') {
    for (const s of [...SEED_REELS, { id: 'sample-live-test' }]) await call(token, 'DELETE', `${BASE}/${s.id}`);
    console.log('Removed sample reels.');
    return;
  }
  const docs =
    mode === '--add-test'
      ? [
          {
            id: 'sample-live-test',
            data: {
              igUrl: 'https://www.instagram.com/reel/SAMPLE05/',
              title: 'Live test: added while the page was open',
              author: '@sample.live',
              sharedAt: new Date().toISOString(),
              bucket: 'Deals & Shopping',
              tags: ['live-test'],
              score: 7,
              isBS: false,
              oneLine: 'Sample: this card should appear without a refresh.',
              status: 'ready',
            },
          },
        ]
      : SEED_REELS;
  for (const s of docs) await call(token, 'PATCH', `${BASE}/${s.id}`, { fields: toFields(s.data) });
  console.log(`Wrote ${docs.length} reel(s) to users/${UID}/reels.`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
