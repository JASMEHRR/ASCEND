/**
 * Jarvis — the AI command core relay.
 *
 * Stateless and tool-agnostic: the client sends the conversation, a context
 * snapshot, and the *declarations* of the tools currently registered in the app.
 * Gemini decides which (if any) tools to call and returns a spoken reply plus a
 * list of tool calls. The client executes tools locally through its registry, so
 * new modules can expose tools without ever touching this backend.
 *
 * Reuses the shared Gemini client (no duplicated AI infrastructure) and the same
 * key/deploy shape as the other routes.
 */
import { Router, type Request, type Response } from 'express';
import { getGemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL, extractJson, GeminiError, isQuotaError } from './gemini';

export const jarvisRouter = Router();

interface ToolDecl {
  name: string;
  description: string;
  module?: string;
  parameters?: Record<string, string>;
}

interface ChatMessage {
  role: string;
  content: string;
}

const PERSONA = `You are JARVIS, the AI command core of Ascend Protocol — a personal life-management operating system. You are calm, sharp, lightly witty (Iron Man's JARVIS energy). Address the user as "sir" occasionally, never every message. Speak like an OS the user trusts, not a chatbot.

You are ALSO a fully capable general-purpose assistant. When the user asks about anything unrelated to Ascend — general knowledge, explanations, advice, math, writing, current topics, casual conversation — answer it directly and completely, exactly as a top-tier AI assistant would. NEVER refuse, deflect, or say you can only help with app-related things. App awareness layers on top of general capability; it never limits it.

This is an ongoing conversation: the message history contains the prior turns of this session. Maintain continuity — remember and reference what was said earlier in the conversation, resolve pronouns and follow-ups against previous messages, and never treat a follow-up as a brand-new request.

You receive a CONTEXT snapshot of the live app: the current page, the user's metrics (discipline score, streak, water, steps, weight, points), rituals, tasks, primary objective, ideas, pain levels, business pipeline, and a MEMORY block (facts the user asked you to remember + your recent actions). Use it to answer with real numbers — never invent values. If the answer is already in context, just answer; don't call a tool. Don't ask for information the context already contains.

You control the app by calling TOOLS. Rules:
- Only use tools from the list; match argument names exactly.
- For a compound request ("plan my day", "log my morning") break it into MULTIPLE tool calls in one response, ordered sensibly.
- Give each tool call a "confidence" from 0 to 1 (how sure you are it's the right action + args). Use < 0.5 only when genuinely unsure.
- If the request is truly ambiguous or missing something essential, set "needsClarification": true, return an empty toolCalls array, and ask ONE short question — otherwise infer sensibly and act.
- Briefly explain multi-step actions in "plan".

Reply lengths:
- "reply" is what is DISPLAYED. For confirmations of actions, keep it to a sentence or two. For informational or general-knowledge questions, give a genuinely useful, complete answer — markdown lists, tables, and code blocks are supported. Do not artificially truncate a real answer.
- "speak" is the short spoken version (under ~40 words), read aloud via text-to-speech. Include it whenever "reply" is more than a couple of sentences; omit it when "reply" is already short.`;

function buildSystem(tools: ToolDecl[], context: unknown): string {
  const toolLines = tools
    .map((t) => {
      const params = t.parameters && Object.keys(t.parameters).length
        ? Object.entries(t.parameters).map(([k, d]) => `${k} (${d})`).join(', ')
        : 'none';
      return `- ${t.name}${t.module ? ` [${t.module}]` : ''}: ${t.description}. args: ${params}`;
    })
    .join('\n');

  return `${PERSONA}

AVAILABLE TOOLS:
${toolLines || '(none)'}

CONTEXT (live app state):
${JSON.stringify(context ?? {}, null, 0)}

RESPONSE FORMAT — return ONLY a raw JSON object, no markdown fences:
{"reply":"<displayed answer — complete for questions, brief for actions>","speak":"<optional short spoken version, under ~40 words>","plan":"<optional one-line plan when several tools run>","toolCalls":[{"tool":"<name>","args":{...},"confidence":0.0}],"needsClarification":false}
"toolCalls" MUST be an empty array when no tool is needed.`;
}

jarvisRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { history, context, tools } = req.body ?? {};
    if (!Array.isArray(history)) {
      res.status(400).json({ error: '`history` must be an array of messages.' });
      return;
    }

    const toolDecls: ToolDecl[] = Array.isArray(tools) ? tools.slice(0, 100) : [];
    const contents = (history as ChatMessage[]).slice(-24).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(m.content ?? '') }],
    }));

    const ai = await getGemini();
    const config = {
      systemInstruction: buildSystem(toolDecls, context),
      responseMimeType: 'application/json',
      maxOutputTokens: 4096,
    };

    // Free-tier daily quotas are per-model, so a quota failure on the primary
    // model gets one shot on the lite model before giving up — Jarvis staying
    // responsive matters more than which flash variant answered.
    let response;
    try {
      response = await ai.models.generateContent({ model: GEMINI_MODEL, contents, config });
    } catch (err) {
      if (!isQuotaError(err)) throw err;
      try {
        response = await ai.models.generateContent({ model: GEMINI_FALLBACK_MODEL, contents, config });
      } catch (err2) {
        if (isQuotaError(err2)) {
          throw new GeminiError(
            429,
            "I've hit the AI quota for today, sir. The Gemini free tier resets daily — or upgrade the API key's plan for uninterrupted service.",
          );
        }
        throw err2;
      }
    }

    // Pass the model's JSON through; the client fully validates/normalizes it.
    const raw = response.text ?? '';
    try {
      const obj = JSON.parse(extractJson(raw));
      res.json({
        reply: typeof obj.reply === 'string' ? obj.reply : 'Systems glitch, sir. Say that again?',
        speak: typeof obj.speak === 'string' ? obj.speak : undefined,
        plan: typeof obj.plan === 'string' ? obj.plan : undefined,
        toolCalls: Array.isArray(obj.toolCalls) ? obj.toolCalls : [],
        needsClarification: obj.needsClarification === true,
      });
    } catch {
      res.json({ reply: raw || 'Systems glitch, sir. Say that again?', toolCalls: [] });
    }
  } catch (err: unknown) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Jarvis request failed';
    if (status >= 500) console.error('[jarvis]', err);
    res.status(status).json({ error: message });
  }
});
