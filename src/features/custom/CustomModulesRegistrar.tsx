/**
 * Jarvis tool: build a custom module from a chat request. Deliberately
 * limited to the four safe building blocks (tracker, counter, list, chart) —
 * Jarvis assembles a module from these, it never writes or deploys code, so
 * a request can't break the app no matter how it's phrased.
 */
import { useEffect, useRef } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import type { JarvisTool } from '../jarvis/types';
import { useCustomModules, type NewCustomModule } from './useCustomModules';
import { isValidKind } from './data';

export default function CustomModulesRegistrar() {
  const { registerTools, registerContext } = useJarvis();
  const { modules, add } = useCustomModules();
  const ref = useRef({ modules, add });
  ref.current = { modules, add };

  useEffect(
    () =>
      registerContext('customModules', () => ({
        customModules: ref.current.modules.map((m) => ({ title: m.title, kind: m.kind })),
      })),
    [registerContext],
  );

  useEffect(() => {
    const tools: JarvisTool[] = [
      {
        name: 'createCustomModule',
        module: 'My Modules',
        description:
          'Build the user their own custom module from a request like "add a module to track X" or "give me a counter for Y". Choose the closest kind: tracker (daily yes/no, like a habit), counter (a running total bumped up/down), list (a simple checklist), or chart (a number logged over time). Only these four kinds exist — pick whichever fits best, never invent a new kind.',
        parameters: {
          title: 'short module name, e.g. "Push-ups" or "Books read"',
          kind: 'one of: tracker, counter, list, chart',
        },
        validate: (a) => {
          if (!String(a.title ?? '').trim()) return 'a title is required';
          if (!isValidKind(a.kind)) return 'kind must be one of: tracker, counter, list, chart';
          return null;
        },
        execute: async (a) => {
          const input: NewCustomModule = { title: String(a.title).trim(), kind: a.kind as NewCustomModule['kind'] };
          const created = await ref.current.add(input);
          if (!created) return { ok: false, message: `couldn't create "${input.title}"` };
          return { ok: true, message: `added "${created.title}" (${created.kind}) to My Modules` };
        },
      },
    ];
    return registerTools('customModules', tools);
  }, [registerTools]);

  return null;
}
