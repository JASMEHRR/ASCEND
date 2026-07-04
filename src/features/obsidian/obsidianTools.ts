import type { JarvisTool } from '../jarvis/types';
import type { ObsidianClient } from './obsidianClient';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Ensure a .md path, respecting any folder the user/model specified. */
const mdPath = (p: string) => (p.toLowerCase().endsWith('.md') ? p : `${p}.md`);

/** Jarvis tools backed by the user's Obsidian vault (via the Local REST API). */
export function createObsidianTools(client: ObsidianClient): JarvisTool[] {
  return [
    {
      name: 'searchNotes',
      module: 'Obsidian',
      description: "Search the user's Obsidian vault for notes matching a query.",
      parameters: { query: 'search text' },
      followUp: true,
      validate: (a) => (str(a.query) ? null : 'a search query is required'),
      execute: async (a) => {
        const hits = await client.search(str(a.query));
        return {
          ok: true,
          message: `${hits.length} note${hits.length === 1 ? '' : 's'} found`,
          data: hits.slice(0, 8).map((h) => ({ path: h.path, context: h.context })),
        };
      },
    },
    {
      name: 'readNote',
      module: 'Obsidian',
      description: 'Read the contents of a note by its vault path.',
      parameters: { path: 'note path, e.g. "Projects/ASCEND.md"' },
      followUp: true,
      validate: (a) => (str(a.path) ? null : 'a note path is required'),
      execute: async (a) => {
        const note = await client.readNote(str(a.path));
        return { ok: true, message: `read ${note.path}`, data: { path: note.path, content: note.content.slice(0, 4000) } };
      },
    },
    {
      name: 'createNote',
      module: 'Obsidian',
      description: 'Create a new markdown note (optionally inside a folder) with content.',
      parameters: { path: 'note path incl. folder, e.g. "Ideas/New idea.md"', content: 'markdown body' },
      validate: (a) => (str(a.path) ? null : 'a note path is required'),
      execute: async (a) => {
        const path = mdPath(str(a.path));
        await client.writeNote(path, str(a.content));
        return { ok: true, message: `created ${path}` };
      },
    },
    {
      name: 'appendToNote',
      module: 'Obsidian',
      description: 'Append markdown to an existing note (creates it if missing).',
      parameters: { path: 'note path', content: 'markdown to append' },
      validate: (a) => (str(a.path) && str(a.content) ? null : 'path and content are required'),
      execute: async (a) => {
        const path = mdPath(str(a.path));
        await client.appendNote(path, str(a.content));
        return { ok: true, message: `updated ${path}` };
      },
    },
    {
      name: 'listNotes',
      module: 'Obsidian',
      description: 'List note paths in the vault or a specific folder.',
      parameters: { folder: 'optional folder path' },
      followUp: true,
      execute: async (a) => {
        const files = await client.listNotes(str(a.folder));
        return { ok: true, message: `${files.length} items`, data: files.slice(0, 40) };
      },
    },
  ];
}
