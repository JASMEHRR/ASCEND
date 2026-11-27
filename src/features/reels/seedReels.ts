/**
 * Four sample reels so the page has something to show before Muse writes the
 * real library. tools/seed-reels.ts writes them; every id starts with
 * `sample-` so Muse (or `--remove`) can delete them once the real docs land.
 * The reviews are illustrative placeholders, not real verdicts.
 */
export interface SeedReel {
  id: string;
  data: Record<string, unknown> & { sharedAt: string };
}

export const SEED_REELS: SeedReel[] = [
  {
    id: 'sample-claude-mcp-setup',
    data: {
      igUrl: 'https://www.instagram.com/reel/SAMPLE01/',
      title: 'Connect Claude to any app with MCP in 5 minutes',
      author: '@sample.creator',
      sharedAt: '2026-11-25T14:30:00.000Z',
      bucket: 'Claude & Coding',
      tags: ['mcp', 'claude', 'coding'],
      score: 8,
      isBS: false,
      oneLine: 'Sample: accurate walkthrough, the 5 minutes assumes Node is already installed.',
      whatItIs: 'Sample entry. A screen recording that adds an MCP server to Claude Desktop through its config file.',
      verdict:
        'Sample verdict. The steps shown match the official setup. The only stretch is the time claim, which ignores installing Node and approving the server the first time.',
      claims: [
        { claim: 'Any app can be connected', status: 'disputed', evidence: 'Only apps that ship or have a community MCP server.' },
        { claim: 'Setup takes a config file edit', status: 'confirmed', evidence: 'Matches the MCP quickstart docs.' },
      ],
      sources: [{ label: 'MCP quickstart', url: 'https://modelcontextprotocol.io/quickstart/user' }],
      nextAction: 'Try it with the filesystem server on the laptop.',
      status: 'ready',
    },
  },
  {
    id: 'sample-antigravity-video',
    data: {
      igUrl: 'https://www.instagram.com/reel/SAMPLE02/',
      title: 'Make a cinematic ad with one prompt',
      author: '@sample.video',
      sharedAt: '2026-11-24T09:10:00.000Z',
      bucket: 'Video & Animation',
      tags: ['video', 'higgsfield', 'antigravity'],
      score: 6,
      isBS: false,
      oneLine: 'Sample: the result is real, but it took many prompts, not one.',
      whatItIs: 'Sample entry. A before/after of an AI generated product ad.',
      verdict: 'Sample verdict. The final clip is plausible for current video models; "one prompt" hides the retries and editing.',
      claims: [
        { claim: 'Made with one prompt', status: 'unverified', evidence: 'No prompt or raw output shown.' },
      ],
      sources: [],
      nextAction: 'Test the same idea in Higgsfield with a 3 shot plan.',
      status: 'ready',
    },
  },
  {
    id: 'sample-trading-bot',
    data: {
      igUrl: 'https://www.instagram.com/reel/SAMPLE03/',
      title: 'This AI bot made 300% in a month',
      author: '@sample.trader',
      sharedAt: '2026-11-23T18:45:00.000Z',
      bucket: 'Trading & Finance',
      tags: ['trading', 'agents'],
      score: 2,
      isBS: true,
      oneLine: 'Sample: no track record, cherry picked screenshot, sells a course.',
      whatItIs: 'Sample entry. A P&L screenshot with a link to a paid group.',
      verdict: 'Sample verdict. Nothing verifiable; the screenshot covers one month and the account is a funnel for a paid signal group.',
      claims: [
        { claim: '300% return in a month', status: 'disputed', evidence: 'Single screenshot, no broker statement.' },
        { claim: 'Runs fully on its own', status: 'unverified', evidence: 'No code or setup shown.' },
      ],
      sources: [{ label: 'SEBI investor caution on unregistered advice', url: 'https://www.sebi.gov.in/' }],
      nextAction: 'Ignore.',
      status: 'ready',
    },
  },
  {
    id: 'sample-internship-portal',
    data: {
      igUrl: 'https://www.instagram.com/reel/SAMPLE04/',
      title: 'Paid summer internships that nobody applies to',
      author: '@sample.careers',
      sharedAt: '2026-11-26T07:05:00.000Z',
      bucket: 'Opportunities',
      tags: ['internships', 'opportunities'],
      score: null,
      isBS: false,
      oneLine: 'Sample: not reviewed yet.',
      whatItIs: 'Sample entry. A list of internship portals.',
      verdict: '',
      claims: [],
      sources: [],
      nextAction: 'Muse to check each portal and add real ones to Internships.',
      status: 'pending',
    },
  },
];
