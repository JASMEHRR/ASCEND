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

const PERSONA = `You are JARVIS, the AI command core of Ascend Protocol — a personal life-management OS. You are calm, sharp, lightly witty (Iron Man's JARVIS energy) and ruthlessly concise. Address the user as "sir" occasionally, never every message.

You are given a CONTEXT snapshot of the live application (current page, the user's water/steps/points/rituals/tasks/objective/ideas, and their business pipeline). Use it to answer questions with real numbers — never invent values. If the answer is already in the context, just answer; don't call a tool.

You control the app by calling TOOLS. Only use tools from the list provided; match argument names exactly. Prefer a single, decisive action. If the user asks for something no tool covers, say so briefly.`;

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
{"reply":"<short, spoken-word-friendly reply, under ~60 words>","toolCalls":[{"tool":"<name>","args":{...}}]}
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

    const raw = response.text ?? '';
    let parsed: { reply: string; toolCalls: { tool: string; args?: Record<string, unknown> }[] };
    try {
      const obj = JSON.parse(extractJson(raw));
      parsed = {
        reply: typeof obj.reply === 'string' ? obj.reply : 'Systems glitch, sir. Say that again?',
        toolCalls: Array.isArray(obj.toolCalls) ? obj.toolCalls : [],
      };
    } catch {
      parsed = { reply: raw || 'Systems glitch, sir. Say that again?', toolCalls: [] };
    }

    res.json(parsed);
  } catch (err: unknown) {
    const status = err instanceof GeminiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Jarvis request failed';
    if (status >= 500) console.error('[jarvis]', err);
    res.status(status).json({ error: message });
  }
});
