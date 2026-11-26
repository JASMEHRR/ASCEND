/**
 * Laptop bridge job rules, pure (no Firestore, no network):
 *
 *   npx tsx bridge-logic.test.ts
 */
import assert from 'node:assert/strict';
import { claimLockPath, cleanError, cleanVersion, nextWork, safeHost, safeId } from './bridge-logic';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const A = 'clipforge.blocky';
const v = (n: number, notes = '') => ({ n, notes });

test('a queued job is rendered as version 1', () => {
  assert.deepEqual(nextWork({ action: A, status: 'pending', versions: [] }, 'tuf'), { kind: 'render', version: 1 });
});

test('other actions and final states are left alone', () => {
  assert.equal(nextWork({ action: 'clipforge.clip', status: 'pending' }, 'tuf'), null);
  for (const status of ['awaiting_review', 'approved', 'failed', 'cancelled', 'done', 'expired']) {
    assert.equal(nextWork({ action: A, status, versions: [v(1)] }, 'tuf'), null, status);
  }
});

test('a running job is recovered only by the laptop that holds it', () => {
  assert.deepEqual(nextWork({ action: A, status: 'running', claimedBy: 'tuf' }, 'tuf'), { kind: 'recover' });
  assert.equal(nextWork({ action: A, status: 'running', claimedBy: 'other' }, 'tuf'), null);
});

test('redo with new notes makes the next version', () => {
  assert.deepEqual(nextWork({ action: A, status: 'redo', notes: ' Slower ending ', versions: [v(1)] }, 'tuf'),
    { kind: 'revise', version: 2, notes: 'Slower ending' });
});

test('redo without notes, or with already answered notes, holds instead of rendering', () => {
  assert.equal(nextWork({ action: A, status: 'redo', notes: '', versions: [v(1)] }, 'tuf')?.kind, 'hold');
  assert.equal(nextWork({ action: A, status: 'redo', notes: 'fix hook', versions: [v(1), v(2, 'fix hook')] }, 'tuf')?.kind, 'hold');
});

test('the third version is the last: a fourth redo holds', () => {
  const w = nextWork({ action: A, status: 'redo', notes: 'again', versions: [v(1), v(2, 'a'), v(3, 'b')] }, 'tuf');
  assert.equal(w?.kind, 'hold');
  assert.match((w as { reason: string }).reason, /cap/i);
});

test('claim lock is one document per version and attempt', () => {
  assert.equal(claimLockPath('u1', 'j1', 2), 'users/u1/jobs/j1/claims/v2-a0');
  assert.equal(claimLockPath('u1', 'j1', 2, 1), 'users/u1/jobs/j1/claims/v2-a1');
});

test('ids and hosts cannot carry paths', () => {
  assert.ok(safeId('abcXYZ_09-'));
  assert.ok(!safeId('../other'));
  assert.ok(!safeId('a/b'));
  assert.ok(safeHost('JASMEHR-TUF'));
  assert.ok(!safeHost('x y'));
});

const good = {
  n: 2, notes: 'n', folder: 'job1/v2', durationS: 61.234, shots: 24, madeAt: '2026-11-26T10:00:00.000Z',
  files: { video: 'video.mp4', frameSheet: 'frames.jpg', frames: ['shot_01.jpg'], narration: 'narration.txt', story: 'story.json' },
};

test('a good version record is accepted and rounded', () => {
  const out = cleanVersion(good, 2);
  assert.notEqual(typeof out, 'string');
  assert.equal((out as { durationS: number }).durationS, 61.23);
});

test('a version with the wrong number, a path in a file name, or no frames is refused', () => {
  assert.equal(typeof cleanVersion({ ...good, n: 3 }, 2), 'string');
  assert.equal(typeof cleanVersion({ ...good, files: { ...good.files, video: '../x.mp4' } }, 2), 'string');
  assert.equal(typeof cleanVersion({ ...good, files: { ...good.files, frames: [] } }, 2), 'string');
  assert.equal(typeof cleanVersion({ ...good, folder: 'job1' }, 2), 'string');
});

test('errors are never empty and never huge', () => {
  assert.match(cleanError(''), /without a message/);
  assert.equal(cleanError('x'.repeat(5000)).length, 2000);
});

console.log(`bridge-logic: ${passed} passed`);
