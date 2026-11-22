/**
 * Internships logic tests. Dependency-free, same style as the Arena tests:
 *
 *   npx tsx src/features/internships/logic.test.ts
 */
import assert from 'node:assert/strict';
import {
  EMPTY_FILTERS,
  countInternships,
  daysUntil,
  failsStipendFloor,
  groupIntoSections,
  isClosingSoon,
  isMayJulWindow,
  matchesFilters,
  normalizeInternship,
  parseDeadline,
  safeLink,
  shortPlace,
  shortStipend,
  splitCompanyRole,
  sectionOf,
} from './logic';
import type { Internship } from './types';

const item = (over: Partial<Internship> & { id: string }): Internship =>
  ({ ...normalizeInternship(over.id, {}), ...over }) as Internship;

const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

// parseDeadline: lenient about wording, strict about the date
assert.equal(ymd(parseDeadline('27 Nov 2026')), '2026-11-27');
assert.equal(ymd(parseDeadline('Nov 27, 2026')), '2026-11-27');
assert.equal(ymd(parseDeadline('2026-11-27')), '2026-11-27');
assert.equal(ymd(parseDeadline('2026-11-27T10:00:00Z')), '2026-11-27');
assert.equal(ymd(parseDeadline('Apply by 3rd December 2026 (unverified)')), '2026-12-3');
assert.equal(ymd(parseDeadline('30 Sept 2027')), '2027-9-30');
assert.equal(parseDeadline('Rolling'), null);
assert.equal(parseDeadline('27 Nov'), null, 'no year means no guess');
assert.equal(parseDeadline('31 Feb 2027'), null, 'impossible dates rejected');
assert.equal(parseDeadline(''), null);

// daysUntil / isClosingSoon
const now = new Date(2026, 10, 22, 23, 30); // 22 Nov 2026, late evening
assert.equal(daysUntil(new Date(2026, 10, 22), now), 0);
assert.equal(daysUntil(new Date(2026, 10, 29), now), 7);
assert.equal(isClosingSoon({ deadlineText: '29 Nov 2026' }, now), true);
assert.equal(isClosingSoon({ deadlineText: '30 Nov 2026' }, now), false);
assert.equal(isClosingSoon({ deadlineText: '21 Nov 2026' }, now), false, 'passed is not "soon"');
assert.equal(isClosingSoon({ deadlineText: 'ASAP' }, now), false);

// May to July badge: explicit ranges only
assert.equal(isMayJulWindow({ deadlineText: '', flags: 'For May–July 2027 window' }), true);
assert.equal(isMayJulWindow({ deadlineText: 'Starts May-Jul 2027', flags: '' }), true);
assert.equal(isMayJulWindow({ deadlineText: '', flags: 'Summer internship 2027' }), true);
assert.equal(isMayJulWindow({ deadlineText: '', flags: 'May require a test' }), false);
assert.equal(isMayJulWindow({ deadlineText: '15 May 2027', flags: '' }), false);

// Stipend floor
assert.equal(failsStipendFloor({ floorCheck: '❌ No' }), true);
assert.equal(failsStipendFloor({ floorCheck: '⚠️ Borderline' }), true);
assert.equal(failsStipendFloor({ floorCheck: '✅ Yes' }), false);

// Link safety
assert.equal(safeLink('https://unstop.com/x'), 'https://unstop.com/x');
assert.equal(safeLink('javascript:alert(1)'), null);
assert.equal(safeLink('data:text/html,hi'), null);
assert.equal(safeLink('unstop.com/x'), null);
assert.equal(safeLink(null), null);

// normalizeInternship survives junk
const junk = normalizeInternship('x', { status: 'weird', score: 'nine', emailStage: 'ghosted', link: '', fullyFunded: 'yes' });
assert.equal(junk.status, 'to-review');
assert.equal(junk.score, null);
assert.equal(junk.emailStage, null);
assert.equal(junk.link, null);
assert.equal(junk.fullyFunded, false);
assert.equal(junk.title, '(untitled)');

// Sections: each entry in exactly one, status wins, auto beats funded
assert.equal(sectionOf({ status: 'apply-queue', autoApply: true, fullyFunded: true }), 'queue');
assert.equal(sectionOf({ status: 'to-review', autoApply: true, fullyFunded: true }), 'auto');
assert.equal(sectionOf({ status: 'to-review', autoApply: false, fullyFunded: true }), 'funded');
assert.equal(sectionOf({ status: 'applied', autoApply: true, fullyFunded: false }), 'applied');
assert.equal(sectionOf({ status: 'closed', autoApply: true, fullyFunded: false }), 'hidden');

const groups = groupIntoSections([
  item({ id: 'low-auto', autoApply: true, score: 3 }),
  item({ id: 'high', score: 9, deadlineText: '1 Dec 2026' }),
  item({ id: 'high-sooner', score: 9, deadlineText: '25 Nov 2026' }),
  item({ id: 'mid', score: 6 }),
  item({ id: 'unscored' }),
  item({ id: 'applied-none', status: 'applied' }),
  item({ id: 'applied-interview', status: 'applied', emailStage: 'interview' }),
  item({ id: 'applied-rejected', status: 'applied', emailStage: 'rejected' }),
]);
assert.deepEqual(groups.auto.map((i) => i.id), ['low-auto'], 'auto-apply pinned regardless of score');
assert.deepEqual(groups.rest.map((i) => i.id), ['high-sooner', 'high', 'mid', 'unscored']);
assert.deepEqual(groups.applied.map((i) => i.id), ['applied-interview', 'applied-none', 'applied-rejected']);

// Filters
const remote = item({ id: 'r', title: 'Growth Intern', org: 'Acme', locationMode: 'Remote', fullyFunded: true });
assert.equal(matchesFilters(remote, { ...EMPTY_FILTERS, search: 'acme' }), true);
assert.equal(matchesFilters(remote, { ...EMPTY_FILTERS, search: 'zeta' }), false);
assert.equal(matchesFilters(remote, { ...EMPTY_FILTERS, remoteOnly: true }), true);
assert.equal(matchesFilters(remote, { ...EMPTY_FILTERS, autoOnly: true }), false);
assert.equal(matchesFilters(remote, { ...EMPTY_FILTERS, status: 'applied' }), false);

// Counts
const counts = countInternships(
  [
    item({ id: 'a', status: 'apply-queue', deadlineText: '25 Nov 2026' }),
    item({ id: 'b', status: 'applied', deadlineText: '25 Nov 2026' }),
    item({ id: 'c', deadlineText: 'Rolling' }),
    item({ id: 'd', deadlineText: '24 Nov 2026' }),
    item({ id: 'e', status: 'skipped', deadlineText: '24 Nov 2026' }),
  ],
  now,
);
assert.deepEqual(counts, { total: 5, queued: 1, applied: 1, closingSoon: 2 });

console.log('internships logic: all tests passed');

// Timestamps from Firestore (objects with toDate) become ISO strings
const ts = normalizeInternship('t', { lastEmailAt: { toDate: () => new Date('2026-11-20T05:00:00Z') } });
assert.equal(ts.lastEmailAt, '2026-11-20T05:00:00.000Z');
console.log('internships timestamp normalisation: passed');

// Compact row text
assert.equal(shortStipend('₹35,000/mo'), '₹35k');
assert.equal(shortStipend('₹22,500/month'), '₹22.5k');
assert.equal(shortStipend('₹20,000 - 30,000/mo'), '₹20k-30k');
assert.equal(shortStipend('₹800/day'), '₹800');
assert.equal(shortStipend('Fully funded + travel'), 'Funded');
assert.equal(shortStipend('Unpaid'), 'Unpaid');
assert.equal(shortStipend(''), '');
assert.equal(shortPlace('Gurgaon, hybrid (relocation)'), 'Gurgaon');
assert.equal(shortPlace('Remote (India)'), 'Remote');
assert.equal(shortPlace('Tokyo'), 'Tokyo');
console.log('internships compact row helpers: passed');

// Company / role / size rating untangling (Muse's first seed put the rating in org)
assert.deepEqual(splitCompanyRole('Ekatra — Founding Generalist Intern', 'Solid'), { company: 'Ekatra', role: 'Founding Generalist Intern', orgTier: 'Solid' });
assert.deepEqual(splitCompanyRole('InterviewBuddies — Digital Marketing Intern (#8)', 'Unknown/small'), { company: 'InterviewBuddies', role: 'Digital Marketing Intern', orgTier: 'Unknown/small' });
assert.deepEqual(splitCompanyRole('RBI Summer Internship', 'Top-tier'), { company: 'RBI Summer Internship', role: '', orgTier: 'Top-tier' });
assert.deepEqual(splitCompanyRole('Mozilla Foundation Fellowship 2027–28', 'Top-tier'), { company: 'Mozilla Foundation Fellowship 2027–28', role: '', orgTier: 'Top-tier' });
// Clean shape: org is the company, rating in orgTier
assert.deepEqual(splitCompanyRole('Marketing Intern', 'Coy', 'Solid'), { company: 'Coy', role: 'Marketing Intern', orgTier: 'Solid' });
assert.deepEqual(splitCompanyRole('Coy — Marketing Intern', 'Coy'), { company: 'Coy', role: 'Marketing Intern', orgTier: '' });
assert.equal(normalizeInternship('n', { title: 'Buildrik — AI & Growth Marketing Intern', org: 'Unknown/small' }).company, 'Buildrik');
console.log('internships company/role split: passed');

// Real stipend formats from Muse's seed
assert.equal(shortStipend('₹30,000–50,000/mo'), '₹30k-50k');
assert.equal(shortStipend('₹1.2L–1.8L (period unstated — likely total/annual, verify)'), '₹1.2L-1.8L');
assert.equal(shortStipend('₹2,000–4,000'), '₹2k-4k');
assert.equal(shortStipend('₹10–20k base + ₹30–50k incentives'), '₹10k-20k');
assert.equal(shortStipend('AED 5,000/mo (≈₹1.23L) + accommodation/flights/visa/medical'), '≈₹1.23L');
assert.equal(shortStipend('Up to US$125,000 / 12 mo (≈₹1.1 Cr total)'), '≈₹1.1Cr');
assert.equal(shortStipend('~€1,538/mo (≈₹1.46L) + travel & visa reimbursed'), '≈₹1.46L');
assert.equal(shortStipend('UNDP stipend; recent home-based posts ~US$500/mo (≈₹45k)'), '≈₹45k');
assert.equal(shortStipend('US$1,472 biweekly (≈₹2.65L/mo full-time equiv.)'), '≈₹2.65L');
assert.equal(shortStipend('CHF 900/mo lump sum (≈₹99k nominal, below Geneva living cost)'), '≈₹99k');
assert.equal(shortStipend('"$0k–$10k" — possibly unpaid'), '"$0k–$10k" — possibly unpaid');
console.log('internships real stipend formats: passed');
