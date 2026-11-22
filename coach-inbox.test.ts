/**
 * Muse bridge rules. Run with: npx tsx coach-inbox.test.ts
 */
import assert from 'node:assert/strict';
import { COACH_LATE_MS, jarvisCommand, museBridgeOn, needsLateNotice, readyReply, toMillis } from './coach-inbox';

const now = Date.parse('2026-11-23T10:00:00Z');
const ts = (ms: number) => ({ toMillis: () => ms });

// toMillis
assert.equal(toMillis(ts(5)), 5);
assert.equal(toMillis({ toDate: () => new Date(7) }), 7);
assert.equal(toMillis('2026-11-23T10:00:00Z'), now);
assert.equal(toMillis(42), 42);
assert.equal(toMillis(null), null);
assert.equal(toMillis('not a date'), null);

// readyReply: only a finished, non-empty reply
assert.equal(readyReply({ status: 'answered', reply: '  Good call. Sleep by eleven.  ' }), 'Good call. Sleep by eleven.');
assert.equal(readyReply({ status: 'answered', reply: '   ' }), null);
assert.equal(readyReply({ status: 'answered', reply: 42 }), null);
assert.equal(readyReply({ status: 'pending', reply: 'draft' }), null);
assert.equal(readyReply({ status: 'delivered', reply: 'old' }), null, 'never spoken twice');

// needsLateNotice: once, after 10 minutes, only while pending
assert.equal(needsLateNotice({ id: 'a', status: 'pending', createdAt: ts(now - COACH_LATE_MS) }, now), true);
assert.equal(needsLateNotice({ id: 'b', status: 'pending', createdAt: ts(now - COACH_LATE_MS + 1000) }, now), false);
assert.equal(needsLateNotice({ id: 'c', status: 'pending', createdAt: ts(now - 3_600_000), lateNoticeAt: 'x' }, now), false);
assert.equal(needsLateNotice({ id: 'd', status: 'answered', createdAt: ts(now - 3_600_000) }, now), false);
assert.equal(needsLateNotice({ id: 'e', status: 'pending' }, now), false, 'no timestamp yet: no guess');

// jarvisCommand: the escape hatch back to Jarvis's tools
assert.equal(jarvisCommand('/j remind me at 5 to call mom'), 'remind me at 5 to call mom');
assert.equal(jarvisCommand('/jarvis tick gym'), 'tick gym');
assert.equal(jarvisCommand('/jarvis@AscendBot what is due'), 'what is due');
assert.equal(jarvisCommand('/j'), null);
assert.equal(jarvisCommand('just thinking out loud'), null);
assert.equal(jarvisCommand('/journal tonight'), null);

// museBridgeOn
assert.equal(museBridgeOn({}), true);
assert.equal(museBridgeOn({ MUSE_BRIDGE: 'off' }), false);
assert.equal(museBridgeOn({ MUSE_BRIDGE: ' OFF ' }), false);
assert.equal(museBridgeOn({ MUSE_BRIDGE: 'on' }), true);

console.log('coach inbox rules: all tests passed');
