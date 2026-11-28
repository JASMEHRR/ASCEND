/**
 * Reels Library logic tests. Dependency-free:
 *
 *   npx tsx src/features/reels/logic.test.ts
 */
import assert from 'node:assert/strict';
import {
  implementTask,
  verdictGroups,
  CLAUDE_PURPOSES,
  UNSORTED_LANE,
  claudeLane,
  isClaudeFirst,
  reevalQueue,
  isClaudeReel,
  categoryIndex,
  cleanCatName,
  inSide,
  normalizeCategory,
  normalizeDivisionSides,
  sidesOf,
  sortCategories,
} from './logic';
import { EMPTY_FILTERS, countTabs, divisions, embedUrl, groupBy, headlineOf, topTags, matchesFilters, normalizeReel, safeLink, scoreTone, sortReels } from './logic';
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

// Links, forYou, archived.
const rich = normalizeReel('r', {
  links: [
    { label: 'Repo', url: 'https://github.com/x/y', paid: false, note: 'Free' },
    { label: 'VPS', url: null, paid: true, note: '$8.79/mo' },
    { note: 'no label or url' },
    'junk',
  ],
  forYou: '  Not for you.  ',
  archived: true,
});
assert.equal(rich.links.length, 2);
assert.equal(rich.links[1].url, null);
assert.equal(rich.links[1].paid, true);
assert.equal(rich.forYou, 'Not for you.');
assert.equal(rich.archived, true);
const bare = normalizeReel('b', {});
assert.deepEqual(bare.links, []);
assert.equal(bare.forYou, '');
assert.equal(bare.archived, false);

// Headline fallback: oneLine, then first sentence of whatItIs, then title.
assert.equal(headlineOf({ oneLine: 'Real tool.', whatItIs: 'A. B.', title: 'T' }), 'Real tool.');
assert.equal(headlineOf({ oneLine: '', whatItIs: 'Costs $8.79/mo. Renews higher.', title: 'T' }), 'Costs $8.79/mo.');
assert.equal(headlineOf({ oneLine: '', whatItIs: 'No full stop here', title: 'T' }), 'No full stop here');
assert.equal(headlineOf({ oneLine: '', whatItIs: '', title: 'T' }), 'T');

// Own categories and Work / Personal.
const anime = normalizeCategory('c1', { name: '  Anime   picks ', side: 'personal', reelIds: ['r1', 'r1', 3] });
const claude = normalizeCategory('c2', { name: 'Claude', side: 'work', reelIds: ['r1', 'r2'] });
assert.equal(anime.name, 'Anime picks');
assert.deepEqual(anime.reelIds, ['r1']);
assert.equal(normalizeCategory('c3', { side: 'nope' }).side, 'personal');
assert.equal(cleanCatName('x'.repeat(60)).length, 40);
assert.deepEqual(sortCategories([anime, claude]).map((c) => c.id), ['c2', 'c1']);
const idx = categoryIndex([anime, claude]);
assert.deepEqual(idx.get('r1')!.map((c) => c.name), ['Claude', 'Anime picks']);
const prefs = normalizeDivisionSides({ 'Claude & Coding': 'personal', Bogus: 'work', Opportunities: 'x' });
assert.deepEqual(prefs, { 'Claude & Coding': 'personal' });
// Own categories win; a reel in a Work and a Personal category shows on both sides.
assert.deepEqual(sidesOf({ bucket: 'Entertainment & Explainers' }, idx.get('r1')!, {}).sort(), ['personal', 'work']);
// No own category: its division decides (default, or his override).
assert.deepEqual(sidesOf({ bucket: 'Entertainment & Explainers' }, [], {}), ['personal']);
assert.deepEqual(sidesOf({ bucket: 'Claude & Coding' }, [], {}), ['work']);
assert.deepEqual(sidesOf({ bucket: 'Claude & Coding' }, [], prefs), ['personal']);
assert.deepEqual(sidesOf({ bucket: null }, [], {}), ['work', 'personal']);
assert.equal(inSide({ bucket: 'Opportunities', tags: [] }, 'personal', [], {}), false);
assert.equal(inSide({ bucket: 'Opportunities', tags: [] }, 'all', [], {}), true);
// Claude lane: bucket, tag or a Claude section puts a reel in it; sections don't change Work/Personal.
const save = normalizeCategory(CLAUDE_PURPOSES[0].id, { name: 'Save money', side: 'claude', reelIds: ['r9'] });
assert.equal(save.side, 'claude');
assert.equal(isClaudeReel({ bucket: 'Claude & Coding', tags: [] }, []), true);
assert.equal(isClaudeReel({ bucket: 'Opportunities', tags: ['mcp'] }, []), true);
assert.equal(isClaudeReel({ bucket: 'Deals & Shopping', tags: ['amazon'] }, [save]), true);
assert.equal(isClaudeReel({ bucket: 'Deals & Shopping', tags: ['amazon'] }, []), false);
assert.equal(inSide({ bucket: 'Deals & Shopping', tags: [] }, 'claude', [], {}), false);
assert.deepEqual(sidesOf({ bucket: 'Deals & Shopping' }, [save], {}), ['personal']);
assert.deepEqual(normalizeDivisionSides({ Opportunities: 'claude' }), {});
// Claude sections sort after Work/Personal, in their set order.
const learn = normalizeCategory('purpose-learn', { name: 'Learn & level up', side: 'claude' });
assert.deepEqual(sortCategories([learn, save, anime, claude]).map((c) => c.id), ['c2', 'c1', 'purpose-save-money', 'purpose-learn']);

// Re-evaluation request.
assert.equal(bare.reevalRequested, false);
const re = normalizeReel('q', { isBS: false, reevalRequested: true, reevalRequestedAt: { toDate: () => new Date('2026-11-29T00:00:00Z') } });
assert.equal(re.reevalRequested, true);
assert.equal(re.reevalRequestedAt, '2026-11-29T00:00:00.000Z');

// v8: Claude-first reels live only in the Claude lane; tag-only ones show in both.
assert.equal(isClaudeFirst({ bucket: 'Claude & Coding' }), true);
assert.equal(inSide({ bucket: 'Claude & Coding', tags: [] }, 'all', [], {}), false);
assert.equal(inSide({ bucket: 'Claude & Coding', tags: [] }, 'work', [], {}), false);
assert.equal(inSide({ bucket: 'Claude & Coding', tags: [] }, 'claude', [], {}), true);
assert.equal(inSide({ bucket: 'Opportunities', tags: ['claude'] }, 'all', [], {}), true);
assert.equal(inSide({ bucket: 'Opportunities', tags: ['claude'] }, 'claude', [], {}), true);
// A Work-side section (setups-hosting) still counts as a Claude section, not as Work.
const hosting = normalizeCategory('purpose-setups-hosting', { name: 'Setups & self-hosting', side: 'work', reelIds: ['L2'] });
assert.deepEqual(sidesOf({ bucket: 'Deals & Shopping' }, [hosting], {}), ['personal']);
assert.equal(isClaudeReel({ bucket: 'Deals & Shopping', tags: [] }, [hosting]), true);
// Lane: sections in set order (empty ones kept), a reel in two sections shows twice, the rest under Unsorted last.
const laneReels = ['L1', 'L2', 'L3'].map((id) => normalizeReel(id, { bucket: 'Claude & Coding' }));
const saveL = normalizeCategory('purpose-save-money', { name: 'Save money', side: 'claude', reelIds: ['L1', 'L2', 'gone'] });
const funL = normalizeCategory('purpose-fun', { name: 'Fun & personal builds', side: 'claude', reelIds: [] });
const lane = claudeLane(laneReels, [hosting, funL, saveL], 'score');
assert.deepEqual(lane.map((g) => [g.name, g.reels.length]), [
  ['Save money', 2],
  ['Fun & personal builds', 0],
  ['Setups & self-hosting', 1],
  [UNSORTED_LANE, 1],
]);
assert.equal(lane[3].reels[0].id, 'L3');
assert.equal(CLAUDE_PURPOSES.length, 9);
// Re-eval queue skips the proof doc.
const q = reevalQueue([
  normalizeReel('zz-bs-test', { reevalRequested: true }),
  normalizeReel('a1', { reevalRequested: true, reevalRequestedAt: '2026-11-28T01:00:00Z' }),
  normalizeReel('a2', { reevalRequested: true, reevalRequestedAt: '2026-11-28T02:00:00Z' }),
  normalizeReel('a3', {}),
]);
assert.deepEqual(q.map((r) => r.id), ['a2', 'a1']);

// Not BS / Paid / BS split inside a category.
const vg = verdictGroups(
  [
    normalizeReel('v1', { isBS: true, links: [{ label: 'x', paid: true }] }),
    normalizeReel('v2', { links: [{ label: 'y', url: 'https://a.b', paid: true }] }),
    normalizeReel('v3', {}),
  ],
  'score',
);
assert.deepEqual(vg.map((g) => [g.name, g.reels.map((r) => r.id)]), [['Not BS', ['v3']], ['Paid', ['v2']], ['BS', ['v1']]]);
assert.deepEqual(verdictGroups([normalizeReel('v4', {})], 'score').map((g) => g.name), ['Not BS']);

// Implement task text.
const task = implementTask(normalizeReel('reel-7', { title: 'Free MCP setup', igUrl: 'https://www.instagram.com/reel/X/', links: [{ label: 'VPS', paid: true, note: '$5/mo' }] }));
assert.ok(task.includes('Ascend reel id: reel-7'));
assert.ok(task.includes('VPS (PAID): $5/mo'));
assert.ok(task.includes('without asking him first'));
assert.ok(!/[–—]/.test(task));

console.log('reels logic: all passed');
