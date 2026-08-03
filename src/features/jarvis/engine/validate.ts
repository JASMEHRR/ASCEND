import type { JarvisResponse, ToolCall } from '../types';

/**
 * Normalize + validate whatever the model returned before anything executes.
 * Malformed tool calls are dropped; args are coerced to a plain object;
 * confidence is clamped to [0,1]. Nothing downstream trusts raw model output.
 */
export function parseJarvisResponse(raw: unknown): JarvisResponse {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const reply =
    typeof obj.reply === 'string' && obj.reply.trim()
      ? obj.reply.trim()
      : "I didn't quite catch that, sir. Could you rephrase?";
  const plan = typeof obj.plan === 'string' && obj.plan.trim() ? obj.plan.trim() : undefined;
  const speak = typeof obj.speak === 'string' && obj.speak.trim() ? obj.speak.trim() : undefined;
  const needsClarification = obj.needsClarification === true;
  const toolCalls = Array.isArray(obj.toolCalls)
    ? obj.toolCalls.map(normalizeToolCall).filter((c): c is ToolCall => c !== null)
    : [];
  return { reply, speak, plan, needsClarification, toolCalls };
}

function normalizeToolCall(raw: unknown): ToolCall | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tool = typeof o.tool === 'string' ? o.tool : typeof o.name === 'string' ? o.name : null;
  if (!tool) return null;
  const args = o.args && typeof o.args === 'object' && !Array.isArray(o.args) ? (o.args as Record<string, unknown>) : {};
  const confidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? Math.max(0, Math.min(1, o.confidence)) : 0.8;
  return { tool, args, confidence };
}
