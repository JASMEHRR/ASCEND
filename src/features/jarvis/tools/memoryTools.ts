import type { JarvisTool } from '../types';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

interface Deps {
  remember: (fact: string) => boolean;
  forget: (match: string) => boolean;
}

/** Long-term memory tools — let the user teach Jarvis durable facts/preferences. */
export function createMemoryTools({ remember, forget }: Deps): JarvisTool[] {
  return [
    {
      name: 'remember',
      module: 'Memory',
      description: 'Store a durable fact or preference the user wants remembered long-term.',
      parameters: { fact: 'the fact to remember' },
      validate: (a) => (str(a.fact) ? null : 'nothing to remember'),
      execute: (a) => {
        remember(str(a.fact));
        return { ok: true, message: `remembered: ${str(a.fact)}` };
      },
    },
    {
      name: 'forget',
      module: 'Memory',
      description: 'Forget a previously remembered fact matching some text.',
      parameters: { match: 'text of the fact to forget' },
      validate: (a) => (str(a.match) ? null : 'need text to match'),
      execute: (a) => {
        const ok = forget(str(a.match));
        return ok ? { ok: true, message: 'forgotten' } : { ok: false, message: `nothing matches "${str(a.match)}"` };
      },
    },
  ];
}
