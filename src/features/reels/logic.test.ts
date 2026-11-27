/**
 * Reels Library logic tests. Dependency-free:
 *
 *   npx tsx src/features/reels/logic.test.ts
 */
import assert from 'node:assert/strict';
import { EMPTY_FILTERS, countTabs, matchesFilters, normalizeReel, safeLink, scoreTone, sortReels } from './logic';
import { SEED_REELS } from './seedReels';

const reels = SEED_REELS.map((s) => normalizeReel(s.id, s.data));

// Normalising bad input never throws and falls back to empty values.
const junk = normalizeReel('x', { bucket: 'Nope', tags: ['MCP', '#mcp', 3], score: 42, claims: [{ claim: 'a', status: 'maybe' }, null], sharedAt: 'bad' });
assert.equal(junk.bucket, null);
assert.deepEqual(junk.tags, ['mcp']);
assert.equal(junk.score, 10);
assert.equal(junk.claims[0].status, 'unverified');
assert.equal(junk.claims.length, 1);
assert.equal(junk.sharedAt, null);
assert.equal(junk.title, '(untitled reel)');

// Firestore Timestamps become ISO strings.
assert.equal(normalizeReel('t', { sharedAt: { toDate: () => new Date('2026-01-02T00:00:00Z') } }).sharedAt, '2026-01-02T00:00:00.000Z');

// Tab counts.
const c = countTabs(reels);
assert.equal(c.all, 4);
assert.equal(c.top, 1);
assert.equal(c.bs, 1);
assert.equal(c['Claude & Coding'], 1);
assert.equal(c['Deals & Shopping'], 0);

// A tag filters across buckets and overrides the tab.
const byTag = reels.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, tab: 'Opportunities', tag: 'agents' }));
assert.deepEqual(byTag.map((r) => r.id), ['sample-trading-bot']);

// Search reads the verdict text, every word must match.
const found = reels.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, search: 'funnel' }));
assert.deepEqual(found.map((r) => r.id), ['sample-trading-bot']);
assert.equal(reels.filter((r) => matchesFilters(r, { ...EMPTY_FILTERS, search: 'funnel claude' })).length, 0);

// Sorting.
assert.equal(sortReels(reels, 'newest')[0].id, 'sample-internship-portal');
const byScore = sortReels(reels, 'score');
assert.equal(byScore[0].id, 'sample-claude-mcp-setup');
assert.equal(byScore[byScore.length - 1].score, null);

// Display helpers.
assert.equal(scoreTone(9), 'high');
assert.equal(scoreTone(5), 'mid');
assert.equal(scoreTone(1), 'low');
assert.equal(scoreTone(null), 'none');
assert.equal(safeLink('javascript:alert(1)'), null);
assert.equal(safeLink('https://instagram.com/reel/x'), 'https://instagram.com/reel/x');

console.log('reels logic: all passed');
