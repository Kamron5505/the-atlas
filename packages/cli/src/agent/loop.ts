import { routeAgentStep, type AtlasConfig, type ChatMessage, type ToolCall, type ToolCallMessage } from "@the-atlas/core";
import type { Lang } from "../i18n.js";
import type { BuiltinTool } from "./tools.js";
import type { AgentTool, ApprovalAnswer, ApprovalRequest, ToolResult } from "./types.js";

/** Progress events for the UI. */
export type AgentEvent =
  | { type: "step"; step: number }
  | { type: "provider"; provider: string; model?: string }
  | { type: "fallback"; provider: string; model?: string; error?: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; tool: AgentTool; args: Record<string, unknown> }
  | { type: "approval"; request: ApprovalRequest }
  | { type: "tool_end"; id: string; tool: AgentTool; args: Record<string, unknown>; result: ToolResult; declined?: boolean }
  | { type: "error"; error: string }
  | { type: "done"; result: AgentResult };

export interface AgentResult {
  /** All assistant text of the run, joined. */
  text: string;
  steps: number;
  /** Project-relative paths written or edited. */
  changedFiles: string[];
  /** Assistant + tool messages produced by the run (append to history only if the provider supports tools). */
  messages: ChatMessage[];
  /** Provider/model of the last step. */
  provider?: string;
  model?: string;
  aborted?: boolean;
  /** Stopped because maxSteps was reached while the model still wanted tools. */
  maxStepsReached?: boolean;
  error?: string;
}

export interface RunAgentOptions {
  cfg: AtlasConfig;
  /** Provider id or "auto" (default cfg.provider). */
  provider?: string;
  model?: string;
  /** Conversation so far, ending with the user's task. */
  messages: ChatMessage[];
  tools: AgentTool[];
  cwd: string;
  lang: Lang;
  approve: (req: ApprovalRequest) => Promise<ApprovalAnswer>;
  onEvent?: (e: AgentEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
}

const LANG_NAME: Record<Lang, string> = { uz: "Uzbek", ru: "Russian", en: "English" };

/** Concise system prompt for agent mode. */
export function agentSystemPrompt(cwd: string, lang: Lang): string {
  const os = process.platform === "win32" ? "Windows (shell: PowerShell 5.1 — no && / ||, use ;)" : process.platform === "darwin" ? "macOS (bash)" : "Linux (bash)";
  return [
    "You are Atlas agent, a coding assistant working directly in the user's project through tools.",
    `OS: ${os}. Project folder (cwd): ${cwd}. All paths are relative to it; you cannot touch files outside it or secret files.`,
    "Use the tools to inspect and change the project instead of guessing. Read a file before editing it; prefer edit_file with a unique old_string over rewriting whole files.",
    "Run commands (tests, builds) to verify your changes when useful. Keep tool calls focused; do not run servers or interactive programs.",
    "If the user declines a tool call, do not retry it; adapt or ask.",
    `When done, reply briefly with what you changed. Answer in the user's language (default: ${LANG_NAME[lang]}).`,
  ].join("\n");
}

function parseArgs(raw: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";

/** Resolves with `fallback` as soon as the signal aborts (the UI may never answer). */
function untilAbort<T>(p: Promise<T>, signal: AbortSignal | undefined, fallback: T): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.resolve(fallback);
  return new Promise<T>((done, fail) => {
    const onAbort = () => done(fallback);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(done, fail).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * Runs the agent loop: model step → tool calls (write tools need approval) → repeat
 * until a step makes no tool calls, maxSteps is reached, or the signal aborts.
 */
export async function runAgent(o: RunAgentOptions): Promise<AgentResult> {
  const maxSteps = o.maxSteps ?? 25;
  // First tool with a name wins (built-ins come first), so a duplicate can't shadow one.
  const byName = new Map<string, AgentTool>();
  for (const t of o.tools) if (!byName.has(t.name)) byName.set(t.name, t);
  const specs = [...byName.values()].map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  const allowed = new Set<string>();
  const changed = new Set<string>();
  const produced: ChatMessage[] = [];
  const texts: string[] = [];
  const convo: ChatMessage[] = [{ role: "system", content: agentSystemPrompt(o.cwd, o.lang) }, ...o.messages.filter((m) => m.role !== "system")];
  const res: AgentResult = { text: "", steps: 0, changedFiles: [], messages: produced };
  const emit = (e: AgentEvent) => o.onEvent?.(e);
  const finish = (extra: Partial<AgentResult> = {}): AgentResult => {
    Object.assign(res, extra, { text: texts.filter(Boolean).join("\n\n"), changedFiles: [...changed] });
    if (extra.error) emit({ type: "error", error: extra.error });
    emit({ type: "done", result: res });
    return res;
  };

  for (let step = 1; step <= maxSteps; step++) {
    if (o.signal?.aborted) return finish({ aborted: true });
    res.steps = step;
    emit({ type: "step", step });
    let text = "";
    let calls: ToolCall[] = [];
    try {
      for await (const ev of routeAgentStep(o.cfg, convo, specs, {
        provider: o.provider,
        model: o.model,
        signal: o.signal,
        onEvent: (r) => {
          if (r.type === "provider") {
            res.provider = r.provider;
            res.model = r.model;
            emit({ type: "provider", provider: r.provider, model: r.model });
          } else emit({ type: "fallback", provider: r.provider, model: r.model, error: r.error });
        },
      })) {
        if (ev.type === "text") {
          text += ev.delta;
          emit({ type: "text", delta: ev.delta });
        } else if (ev.type === "tool_calls") calls = ev.calls;
      }
    } catch (err) {
      texts.push(text);
      if (isAbort(err) || o.signal?.aborted) return finish({ aborted: true });
      return finish({ error: (err as Error).message });
    }
    texts.push(text);

    const toolCalls: ToolCallMessage[] = calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } }));
    const assistant: ChatMessage = { role: "assistant", content: text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
    convo.push(assistant);
    produced.push(assistant);
    if (!calls.length) return finish();

    for (const call of calls) {
      const answer = (output: string) => {
        const m: ChatMessage = { role: "tool", tool_call_id: call.id, content: output };
        convo.push(m);
        produced.push(m);
      };
      if (o.signal?.aborted) {
        answer("Cancelled by the user.");
        continue;
      }
      const tool = byName.get(call.name);
      const args = parseArgs(call.arguments);
      if (!tool || !args) {
        answer(!tool ? `Error: unknown tool "${call.name}". Available: ${[...byName.keys()].join(", ")}` : "Error: arguments must be a JSON object");
        continue;
      }
      if (tool.risk === "write" && !allowed.has(tool.name)) {
        const preview = (tool as BuiltinTool).preview?.(args, { cwd: o.cwd, signal: o.signal }) ?? JSON.stringify(args, null, 2).slice(0, 2000);
        const request: ApprovalRequest = { tool, args, preview };
        emit({ type: "approval", request });
        let a: ApprovalAnswer;
        try {
          a = await untilAbort(o.approve(request), o.signal, "no");
        } catch {
          a = "no";
        }
        if (o.signal?.aborted) {
          answer("Cancelled by the user.");
          continue;
        }
        if (a === "always") allowed.add(tool.name);
        if (a === "no") {
          const result: ToolResult = { output: "The user declined this action. Do not retry it; continue without it or ask the user.", isError: true, summary: "declined" };
          emit({ type: "tool_end", id: call.id, tool, args, result, declined: true });
          answer(result.output);
          continue;
        }
      }
      emit({ type: "tool_start", id: call.id, tool, args });
      let result: ToolResult;
      try {
        result = await tool.run(args, { cwd: o.cwd, signal: o.signal });
      } catch (err) {
        result = { output: `Error: ${(err as Error).message}`, isError: true };
      }
      if (!result.isError && tool.source === "atlas" && (tool.name === "write_file" || tool.name === "edit_file") && typeof args.path === "string") {
        changed.add(args.path.replace(/\\/g, "/").replace(/^\.\//, ""));
      }
      emit({ type: "tool_end", id: call.id, tool, args, result });
      answer(result.output);
    }
  }
  return finish({ maxStepsReached: true });
}
