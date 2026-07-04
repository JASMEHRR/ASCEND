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
import { getGemini, GEMINI_MODEL, extractJson, GeminiError } from './gemini';

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

const PERSONA = `You are JARVIS, the AI command core of Ascend Protocol — a personal life-management operating system. You are calm, sharp, lightly witty (Iron Man's JARVIS energy) and ruthlessly concise. Address the user as "sir" occasionally, never every message. Speak like an OS the user trusts, not a chatbot.

You receive a CONTEXT snapshot of the live app: the current page, the user's metrics (discipline score, streak, water, steps, weight, points), rituals, tasks, primary objective, ideas, pain levels, business pipeline, and a MEMORY block (facts the user asked you to remember + your recent actions). Use it to answer with real numbers — never invent values. If the answer is already in context, just answer; don't call a tool. Don't ask for information the context already contains.

You control the app by calling TOOLS. Rules:
- Only use tools from the list; match argument names exactly.
- For a compound request ("plan my day", "log my morning") break it into MULTIPLE tool calls in one response, ordered sensibly.
- Give each tool call a "confidence" from 0 to 1 (how sure you are it's the right action + args). Use < 0.5 only when genuinely unsure.
- If the request is truly ambiguous or missing something essential, set "needsClarification": true, return an empty toolCalls array, and ask ONE short question — otherwise infer sensibly and act.
- Briefly explain multi-step actions in "plan".
- Keep "reply" short and spoken-word friendly; it will be read aloud.`;

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
{"reply":"<short spoken reply, under ~60 words>","plan":"<optional one-line plan when several tools run>","toolCalls":[{"tool":"<name>","args":{...},"confidence":0.0}],"needsClarification":false}
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
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: buildSystem(toolDecls, context),
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
      },
    });

    // Pass the model's JSON through; the client fully validates/normalizes it.
    const raw = response.text ?? '';
    try {
      const obj = JSON.parse(extractJson(raw));
      res.json({
        reply: typeof obj.reply === 'string' ? obj.reply : 'Systems glitch, sir. Say that again?',
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
