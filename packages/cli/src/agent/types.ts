/**
 * Shared contract between agent mode (built-in tools) and MCP (external tools).
 * Every tool the model can call implements AgentTool.
 */

/** JSON Schema object describing a tool's arguments (OpenAI function-calling format). */
export type JsonSchema = Record<string, unknown>;

export interface AgentTool {
  /** Unique, [a-zA-Z0-9_-]{1,64}. MCP tools are prefixed: "mcp__<server>__<tool>". */
  name: string;
  description: string;
  parameters: JsonSchema;
  /**
   * "read"  — safe, runs without asking (read_file, list_dir, search).
   * "write" — changes files or runs commands; needs the user's approval
   *           unless they chose "allow for this session".
   */
  risk: "read" | "write";
  /** Where the tool comes from, for the UI ("atlas", or the MCP server name). */
  source: string;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  /** Project root; built-in file tools must refuse paths outside it. */
  cwd: string;
  signal?: AbortSignal;
}

export interface ToolResult {
  /** Text sent back to the model (truncate large outputs). */
  output: string;
  isError?: boolean;
  /** Short human summary for the transcript, e.g. "src/app.ts +12 -3". */
  summary?: string;
}

/** What the agent loop asks the UI before running a "write" tool. */
export interface ApprovalRequest {
  tool: AgentTool;
  args: Record<string, unknown>;
  /** Human-readable preview: a diff for edits, the command line for run_command. */
  preview: string;
}

export type ApprovalAnswer = "yes" | "always" | "no";
