import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { AgentTool, ToolContext, ToolResult } from "../agent/types.js";
import { isRemote, loadMcpConfig, maskSecrets, type McpConfig, type McpServerConfig } from "./config.js";

export const CONNECT_TIMEOUT_MS = 15_000;
export const CALL_TIMEOUT_MS = 120_000;
export const OUTPUT_CAP = 20_000;
const STDERR_CAP = 8_000;

export type McpState = "connecting" | "connected" | "failed" | "disabled";

/** Per-server status for `atlas mcp list` and the /mcp overlay. */
export interface McpServerStatus {
  name: string;
  state: McpState;
  transport: "stdio" | "http" | "sse";
  tools: number;
  error?: string;
}

/** Minimal MCP tool shape (from tools/list). */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; [k: string]: unknown };
}

interface Entry {
  name: string;
  server: McpServerConfig;
  status: McpServerStatus;
  client?: Client;
  transport?: Transport;
  tools: AgentTool[];
  raw: McpToolInfo[];
  stderr: string;
  pending?: Promise<McpServerStatus>;
  /** Bumped by closeAll() so an in-flight connect gives up instead of leaking a child process. */
  gen: number;
}

export interface McpManagerOptions {
  /** Defaults to loadMcpConfig(). */
  config?: McpConfig;
  connectTimeoutMs?: number;
  callTimeoutMs?: number;
  /** Working dir for stdio servers without their own cwd. */
  cwd?: string;
}

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Server part that cannot be confused with the "__" separator. */
const CLEAN_SERVER = /^[a-zA-Z0-9-]+(?:_[a-zA-Z0-9-]+)*$/;
const CLEAN_TOOL = /^[a-zA-Z0-9_-]+$/;
const PLAIN_MAX = 55;

/**
 * "mcp__<server>__<tool>", restricted to [a-zA-Z0-9_-]{1,64}. Depends only on
 * (server, tool), so a name always means the same tool ("always" approvals are
 * keyed by it). Ambiguous, lossy or long names get a hash suffix and are
 * exactly 64 chars, so they never equal a plain name (max 55).
 */
export function mcpToolName(server: string, tool: string): string {
  const full = `mcp__${sanitize(server)}__${sanitize(tool)}`;
  if (full.length <= PLAIN_MAX && CLEAN_SERVER.test(server) && CLEAN_TOOL.test(tool)) return full;
  const h = createHash("sha256").update(`${server}\0${tool}`).digest("hex").slice(0, 12);
  return `${full.slice(0, 51).padEnd(51, "_")}_${h}`;
}

/** Strips control chars (ANSI escapes etc.) from server-supplied text before it reaches the terminal. */
export function printable(s: string, keepNewlines = false): string {
  return s.replace(keepNewlines ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g : /[\u0000-\u001f\u007f-\u009f]/g, (c) => (c === "\t" ? " " : ""));
}

function kb(base64: string | undefined): string {
  const bytes = Math.floor(((base64?.length ?? 0) * 3) / 4);
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

/** Caps text to `max` chars with a marker. */
export function capOutput(s: string, max = OUTPUT_CAP): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n… [truncated ${s.length - max} chars]`;
}

/** Flattens an MCP tool result into plain text for the model. */
export function flattenContent(result: { content?: unknown; structuredContent?: unknown; toolResult?: unknown }): string {
  const parts: string[] = [];
  const content = Array.isArray(result.content) ? (result.content as Record<string, unknown>[]) : [];
  for (const c of content) {
    switch (c.type) {
      case "text":
        parts.push(String(c.text ?? ""));
        break;
      case "image":
      case "audio":
        parts.push(`[${c.type} ${String(c.mimeType ?? "")} ${kb(c.data as string)}]`);
        break;
      case "resource": {
        const r = (c.resource ?? {}) as Record<string, unknown>;
        if (typeof r.text === "string") parts.push(`[resource ${String(r.uri ?? "")}]\n${r.text}`);
        else parts.push(`[resource ${String(r.uri ?? "")} ${String(r.mimeType ?? "")} ${kb(r.blob as string)}]`);
        break;
      }
      case "resource_link":
        parts.push(`[resource_link ${String(c.uri ?? "")}${c.name ? ` ${String(c.name)}` : ""}]`);
        break;
      default:
        parts.push(`[${String(c.type)}]`);
    }
  }
  if (!parts.length && result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
  if (!parts.length && result.toolResult !== undefined) parts.push(JSON.stringify(result.toolResult));
  return parts.join("\n");
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 300);

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/**
 * Connects to configured MCP servers and exposes their tools as AgentTools.
 * One failing server never affects the others.
 */
export class McpManager {
  private entries = new Map<string, Entry>();
  private readonly connectTimeout: number;
  private readonly callTimeout: number;
  private readonly cwd?: string;

  constructor(opts: McpManagerOptions = {}) {
    const cfg = opts.config ?? loadMcpConfig();
    this.connectTimeout = opts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.callTimeout = opts.callTimeoutMs ?? CALL_TIMEOUT_MS;
    this.cwd = opts.cwd;
    for (const [name, server] of Object.entries(cfg.mcpServers)) {
      const transport = isRemote(server) ? "http" : "stdio";
      this.entries.set(name, {
        name,
        server,
        status: { name, state: server.disabled ? "disabled" : "failed", transport, tools: 0, ...(server.disabled ? {} : { error: "not connected" }) },
        tools: [],
        raw: [],
        stderr: "",
        gen: 0,
      });
    }
  }

  /** Server names in config order. */
  names(): string[] {
    return [...this.entries.keys()];
  }

  /** Connects every enabled server in parallel. */
  async connectAll(): Promise<McpServerStatus[]> {
    await Promise.all([...this.entries.values()].filter((e) => !e.server.disabled).map((e) => this.connect(e.name)));
    return this.status();
  }

  /** (Re)connects one server; never throws for server failures. */
  connect(name: string): Promise<McpServerStatus> {
    const e = this.entries.get(name);
    if (!e) return Promise.reject(new Error(`Unknown MCP server: ${name}`));
    if (e.server.disabled) return Promise.resolve({ ...e.status });
    if (e.pending) return e.pending;
    e.pending = this.doConnect(e).finally(() => (e.pending = undefined));
    return e.pending;
  }

  private async doConnect(e: Entry): Promise<McpServerStatus> {
    const gen = e.gen;
    const alive = () => {
      if (e.gen !== gen) throw new Error("closed");
    };
    await this.drop(e);
    e.status = { ...e.status, state: "connecting", tools: 0, error: undefined };
    try {
      alive();
      if (isRemote(e.server)) {
        try {
          await this.open(e, "http");
        } catch (first) {
          await this.drop(e);
          alive();
          try {
            await this.open(e, "sse");
          } catch {
            throw first;
          }
        }
      } else {
        await this.open(e, "stdio");
      }
      alive();
      const raw = await withTimeout(this.listAll(e.client!), this.connectTimeout, "tools/list");
      alive();
      e.raw = raw;
      e.tools = raw.map((t) => this.wrap(e, t));
      e.status = { ...e.status, state: "connected", tools: e.tools.length, error: undefined };
    } catch (err) {
      await this.drop(e);
      const tail = e.stderr.trim().split("\n").filter(Boolean).at(-1);
      const msg = errText(err) + (tail && !errText(err).includes(tail) ? ` (${tail.slice(0, 200)})` : "");
      e.status = { ...e.status, state: "failed", tools: 0, error: maskSecrets(printable(msg)) };
    }
    return { ...e.status };
  }

  private async open(e: Entry, kind: "stdio" | "http" | "sse"): Promise<void> {
    const client = new Client({ name: "the-atlas", version: "0.1.0" });
    let transport: Transport;
    if (kind === "stdio" && !isRemote(e.server)) {
      const s = e.server;
      const stdio = new StdioClientTransport({
        command: s.command,
        args: s.args ?? [],
        ...(s.env ? { env: s.env } : {}),
        ...(s.cwd || this.cwd ? { cwd: s.cwd ?? this.cwd } : {}),
        stderr: "pipe",
      });
      e.stderr = "";
      stdio.stderr?.on("data", (chunk: Buffer | string) => {
        e.stderr = (e.stderr + chunk.toString()).slice(-STDERR_CAP);
      });
      transport = stdio;
    } else if (isRemote(e.server)) {
      const url = new URL(e.server.url);
      const requestInit = e.server.headers ? { headers: e.server.headers } : undefined;
      transport = kind === "sse" ? new SSEClientTransport(url, { requestInit }) : new StreamableHTTPClientTransport(url, { requestInit });
    } else {
      throw new Error("bad transport");
    }
    e.client = client;
    e.transport = transport;
    e.status = { ...e.status, transport: kind };
    client.onerror = () => {};
    client.onclose = () => {
      if (e.client === client && e.status.state === "connected") {
        e.status = { ...e.status, state: "failed", tools: 0, error: "connection closed" };
        e.tools = [];
        e.client = undefined;
      }
    };
    await withTimeout(client.connect(transport, { timeout: this.connectTimeout }), this.connectTimeout, "connect");
  }

  private async listAll(client: Client): Promise<McpToolInfo[]> {
    const out: McpToolInfo[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const res = await client.listTools(cursor ? { cursor } : undefined, { timeout: this.connectTimeout });
      out.push(...(res.tools as McpToolInfo[]));
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  private wrap(e: Entry, t: McpToolInfo): AgentTool {
    const schema = t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object", properties: {} };
    return {
      name: mcpToolName(e.name, t.name),
      description: (t.description ?? t.name).slice(0, 1024),
      parameters: schema,
      // Annotations are server-supplied and untrusted (MCP spec): every MCP tool needs approval.
      risk: "write",
      source: e.name,
      run: (args, ctx) => this.call(e, t.name, args, ctx),
    };
  }

  private async call(e: Entry, tool: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const client = e.client;
    if (!client || e.status.state !== "connected") return { output: `MCP server "${e.name}" is not connected`, isError: true };
    try {
      const res = (await client.callTool({ name: tool, arguments: args }, undefined, {
        timeout: this.callTimeout,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      })) as { content?: unknown; isError?: boolean; structuredContent?: unknown; toolResult?: unknown };
      const output = capOutput(flattenContent(res));
      return { output, isError: res.isError === true, summary: `${e.name}/${tool}` };
    } catch (err) {
      return { output: capOutput(`MCP ${e.name}/${tool} failed: ${errText(err)}`), isError: true, summary: `${e.name}/${tool}` };
    }
  }

  private async drop(e: Entry): Promise<void> {
    const client = e.client;
    const transport = e.transport;
    e.client = undefined;
    e.transport = undefined;
    e.tools = [];
    try {
      if (client) await client.close();
      else if (transport) await transport.close();
    } catch {
      // Already gone.
    }
  }

  /**
   * All tools of connected servers. Names come from mcpToolName() and are
   * stable; a duplicate (a server listing one tool twice) is dropped, never
   * renamed, so a name cannot move to a different tool.
   */
  tools(): AgentTool[] {
    const seen = new Set<string>();
    const out: AgentTool[] = [];
    for (const e of this.entries.values()) {
      if (e.status.state !== "connected") continue;
      for (const t of e.tools) {
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        out.push(t);
      }
    }
    return out;
  }

  /** Raw MCP tool list of one server (for `atlas mcp tools`). */
  serverTools(name: string): McpToolInfo[] {
    return this.entries.get(name)?.raw ?? [];
  }

  status(): McpServerStatus[] {
    return [...this.entries.values()].map((e) => ({ ...e.status }));
  }

  /** Last stderr output of a stdio server (diagnostics; never printed into the TUI). */
  stderr(name: string): string {
    return this.entries.get(name)?.stderr ?? "";
  }

  /** Disconnects everything and kills child processes. */
  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.entries.values()].map(async (e) => {
        e.gen++;
        await this.drop(e);
        if (e.status.state !== "disabled") e.status = { ...e.status, state: "failed", tools: 0, error: "closed" };
      }),
    );
  }
}

