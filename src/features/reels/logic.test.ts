/**
 * Reels Library logic tests. Dependency-free:
 *
 *   npx tsx src/features/reels/logic.test.ts
 */
import assert from 'node:assert/strict';
import { EMPTY_FILTERS, countTabs, divisions, embedUrl, groupBy, topTags, matchesFilters, normalizeReel, safeLink, scoreTone, sortReels } from './logic';
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

// Subcategory sections: biggest first, missing subcat last as Other.
const withSub = [
  normalizeReel('a', { bucket: 'Claude & Coding', subcat: 'Skills', score: 5 }),
  normalizeReel('b', { bucket: 'Claude & Coding', subcat: 'Skills', score: 9 }),
  normalizeReel('c', { bucket: 'Claude & Coding', subcat: '', score: 10 }),
  normalizeReel('d', { bucket: 'Claude & Coding', subcat: 'Prompts', score: 1 }),
];
const groups = groupBy(withSub, (r) => r.subcat, 'score');
assert.deepEqual(groups.map((g) => g.name), ['Skills', 'Prompts', 'Other']);
assert.deepEqual(groups[0].reels.map((r) => r.id), ['b', 'a']);
const cc = divisions(withSub).find((d) => d.bucket === 'Claude & Coding')!;
assert.equal(cc.count, 4);
assert.equal(cc.topScore, 10);
assert.deepEqual(cc.subcats, ['Skills', 'Prompts', 'Other']);
assert.equal(topTags(reels, 1)[0].count, 1);

// Embed links.
assert.equal(embedUrl('https://www.instagram.com/reel/ABC_12-x/?igsh=1'), 'https://www.instagram.com/reel/ABC_12-x/embed/');
assert.equal(embedUrl('https://instagram.com/p/XYZ/'), 'https://www.instagram.com/p/XYZ/embed/');
assert.equal(embedUrl('https://www.instagram.com/someuser/reel/QQ1/'), 'https://www.instagram.com/reel/QQ1/embed/');
assert.equal(embedUrl(''), null);
assert.equal(embedUrl('https://evil.com/reel/ABC/'), null);
assert.equal(embedUrl('https://www.instagram.com/someuser/'), null);

console.log('reels logic: all passed');
