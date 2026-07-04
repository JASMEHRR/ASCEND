export interface ToolResult {
  ok: boolean;
  /** Short human-readable outcome, shown as a "✓ …" chip and used for summaries. */
  message: string;
  /** Optional structured data for Jarvis to reason/speak about (with followUp). */
  data?: unknown;
}

export interface JarvisTool {
  name: string;
  description: string;
  /** Owning module, e.g. "Health", "Tasks", "Strategic Command". */
  module: string;
  /** argName -> human description, sent to the model as the parameter spec. */
  parameters?: Record<string, string>;
  /** When true, the tool's result is fed back for a spoken summary (reads/AI). */
  followUp?: boolean;
  /**
   * Validate raw args from the model before execution. Return an error string to
   * reject the call, or null/undefined to accept. Prevents malformed actions.
   */
  validate?: (args: Record<string, unknown>) => string | null | undefined;
  execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

export interface JarvisMessage {
  role: 'user' | 'assistant';
  content: string;
  /**
   * UI-only outcome chips (tool results / skips) rendered under the bubble.
   * Never sent to the model — keeping decorations out of the transcript keeps
   * multi-turn context clean.
   */
  status?: StatusLine[];
}

export interface StatusLine {
  kind: 'ok' | 'warn' | 'info';
  text: string;
}

/** A slice of live app context that a module contributes to Jarvis's awareness. */
export type ContextProvider = () => Record<string, unknown>;

/** Tool declaration sent to the backend (execute stays client-side). */
export interface ToolDeclaration {
  name: string;
  description: string;
  module: string;
  parameters?: Record<string, string>;
}

/** A tool invocation proposed by the model, with a self-reported confidence. */
export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  confidence: number;
}

/** The validated shape returned by the /api/jarvis relay. */
export interface JarvisResponse {
  reply: string;
  /** Optional short spoken version of the reply (TTS); reply itself may be long. */
  speak?: string;
  /** Optional one-line plan when several tools run together. */
  plan?: string;
  toolCalls: ToolCall[];
  /** True when the model needs the user to clarify before acting. */
  needsClarification?: boolean;
}

/** Record of a tool the assistant executed this session (recent-actions memory). */
export interface ActionRecord {
  tool: string;
  module: string;
  summary: string;
  ok: boolean;
  at: string;
}
