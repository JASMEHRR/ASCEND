import { parseJarvisResponse } from './validate';
import type { JarvisMessage, JarvisResponse, ToolDeclaration } from '../types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST to the Jarvis relay once. Aborts propagate; other failures throw. */
async function once(
  history: JarvisMessage[],
  context: Record<string, unknown>,
  tools: ToolDeclaration[],
  signal?: AbortSignal,
): Promise<JarvisResponse> {
  const res = await fetch('/api/jarvis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, context, tools }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Server error (${res.status})`);
  return parseJarvisResponse(data);
}

/**
 * Call the Jarvis relay with one transient retry. Retrying the LLM call is safe
 * (it mutates nothing); tool side-effects are never auto-retried.
 */
export async function callJarvis(
  history: JarvisMessage[],
  context: Record<string, unknown>,
  tools: ToolDeclaration[],
  signal?: AbortSignal,
): Promise<JarvisResponse> {
  try {
    return await once(history, context, tools, signal);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    await sleep(600);
    return once(history, context, tools, signal);
  }
}
