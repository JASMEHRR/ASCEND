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
  execute: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
}

export interface JarvisMessage {
  role: 'user' | 'assistant';
  content: string;
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
