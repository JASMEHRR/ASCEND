/**
 * @mentions in room chat — pure text parsing, no React/Firestore.
 *
 * A mention is written as @Name in the message body. Resolving it to a
 * player id happens client-side against the room roster at send time (not
 * stored as markup in the body), so the body stays plain, readable text and
 * the mentioned ids travel separately in MessageDoc.mentions.
 */
import type { Player } from './types';

/** Names currently being typed as "@partial" at the given cursor position. */
export function activeMentionQuery(text: string, cursor: number): string | null {
  const upTo = text.slice(0, cursor);
  const match = upTo.match(/@([a-zA-Z0-9_]*)$/);
  return match ? match[1] : null;
}

/** Players whose name starts with the query, case-insensitive, self excluded. */
export function matchPlayers(players: Player[], query: string, selfId?: string): Player[] {
  const needle = query.toLowerCase();
  return players
    .filter((p) => p.id !== selfId)
    .filter((p) => p.name.toLowerCase().startsWith(needle))
    .slice(0, 6);
}

/** Replace the in-progress "@partial" at the cursor with the chosen player's full name. */
export function applyMention(text: string, cursor: number, name: string): { text: string; cursor: number } {
  const upTo = text.slice(0, cursor);
  const rest = text.slice(cursor);
  const replaced = upTo.replace(/@([a-zA-Z0-9_]*)$/, `@${name} `);
  return { text: replaced + rest, cursor: replaced.length };
}

/** Resolve every "@Name" in the body to a player id, matching whole names. */
export function resolveMentions(body: string, players: Player[]): string[] {
  const ids = new Set<string>();
  for (const p of players) {
    // Word-boundary match so "@Al" doesn't also catch inside "@Alfred".
    const re = new RegExp(`@${escapeRegExp(p.name)}\\b`, 'i');
    if (re.test(body)) ids.add(p.id);
  }
  return [...ids];
}

/** Split a message body into plain-text and mention segments, for rendering. */
export function splitMentionSegments(body: string, players: Player[]): { text: string; isMention: boolean }[] {
  if (players.length === 0) return [{ text: body, isMention: false }];
  const names = players.map((p) => escapeRegExp(p.name)).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(@(?:${names.join('|')})\\b)`, 'gi');
  return body.split(re).filter((s) => s.length > 0).map((s) => ({ text: s, isMention: re.test(s) && s.startsWith('@') }));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
