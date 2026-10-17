import type { ResolvedProvider } from "./config.js";
import type { ModelInfo } from "./providers.js";

/** OpenAI-style multimodal part (text or an image as a data: URL). */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/** A function call requested by the model (OpenAI format). */
export interface ToolCallMessage {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  /** "" on assistant tool-call messages. */
  content: string | ContentPart[];
  /** Assistant: tools the model wants to run. */
  tool_calls?: ToolCallMessage[];
  /** Tool: the call this message answers. */
  tool_call_id?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
  /** Called with the provider's response headers (rate-limit counters live there). */
  onResponse?: (provider: string, headers: Headers) => void;
}

/** Plain text of a message (images dropped) — for token estimates and exports. */
export function messageText(m: ChatMessage): string {
  if (m.content == null) return ""; // providers may send null on tool-call messages
  return typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "[image]")).join("\n");
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Free quota / rate limit used up — the user should switch AI or model. */
  get limited(): boolean {
    return this.status === 429 || this.status === 402 || /quota|rate.?limit|credits|exhausted|limit reached/i.test(this.message);
  }

  /** Worth trying the next provider (rate limit, outage, bad key, unreachable). */
  get retryable(): boolean {
    return this.status === undefined || this.status === 401 || this.status === 403 || this.status === 404 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

function headers(p: ResolvedProvider): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  if (p.def.id === "openrouter") {
    h["HTTP-Referer"] = "https://github.com/the-atlas";
    h["X-Title"] = "The Atlas";
  }
  return h;
}

async function request(p: ResolvedProvider, path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${p.baseURL}${path}`, { ...init, headers: headers(p) });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ProviderError(`${p.def.name}: unreachable (${(err as Error).message})`, p.def.id);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
      detail = typeof body.error === "string" ? body.error : (body.error?.message ?? body.message ?? "");
    } catch {
      // non-JSON error body
    }
    throw new ProviderError(`${p.def.name}: HTTP ${res.status}${detail ? ` – ${detail.slice(0, 200)}` : ""}`, p.def.id, res.status);
  }
  return res;
}

/** Forwards a raw OpenAI-compatible request; throws ProviderError on non-2xx. */
export async function forwardRaw(p: ResolvedProvider, path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return request(p, path, { method: "POST", body: JSON.stringify(body), signal });
}

/** Parses an OpenAI-style SSE stream into content deltas. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
          if (json.error) throw new Error(json.error.message ?? "stream error");
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamChat(p: ResolvedProvider, messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
  const model = opts.model ?? p.model;
  if (!model) throw new ProviderError(`${p.def.name}: no model selected`, p.def.id, 404);
  const res = await request(p, "/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model, messages, stream: true, temperature: opts.temperature }),
    signal: opts.signal,
  });
  opts.onResponse?.(p.def.id, res.headers);
  if (!res.body) throw new ProviderError(`${p.def.name}: empty response`, p.def.id, 502);
  yield* parseSSE(res.body);
}

export async function listModels(p: ResolvedProvider, signal?: AbortSignal): Promise<ModelInfo[]> {
  const res = await request(p, "/models", { method: "GET", signal });
  const json = (await res.json()) as { data?: unknown[]; models?: unknown[] };
  const items = (json.data ?? json.models ?? []) as {
    id?: string;
    name?: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
  }[];
  return items
    .filter((m) => typeof m.id === "string")
    .map((m) => {
      const info: ModelInfo = {
        id: m.id!.replace(/^models\//, ""),
        provider: p.def.id,
        name: m.name,
        contextLength: m.context_length,
        pricing: m.pricing,
      };
      info.free = p.def.freeModelFilter ? p.def.freeModelFilter(info) : p.def.free;
      return info;
    });
}

/** Tool definition sent to the model (OpenAI function-calling format). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A complete tool call after the stream ends. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ToolStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "done"; finishReason?: string };

/** Parses an SSE stream into raw JSON chunks (each `data:` line); stops at [DONE]. */
export async function* parseSSEChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const parse = (line: string): Record<string, unknown> | "done" | undefined => {
    line = line.trim();
    if (!line.startsWith("data:")) return undefined;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return "done";
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const r = parse(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        if (r === "done") return;
        if (r) yield r;
      }
    }
    const r = parse(buf);
    if (r && r !== "done") yield r;
  } finally {
    reader.releaseLock();
  }
}

interface ToolDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/**
 * Streams one model step with tools available. Yields text deltas as they
 * arrive, then the accumulated tool calls (if any), then "done".
 */
export async function* streamChatTools(
  p: ResolvedProvider,
  messages: ChatMessage[],
  tools: ToolSpec[],
  opts: ChatOptions = {},
): AsyncGenerator<ToolStreamEvent> {
  const model = opts.model ?? p.model;
  if (!model) throw new ProviderError(`${p.def.name}: no model selected`, p.def.id, 404);
  const body: Record<string, unknown> = { model, messages, stream: true, temperature: opts.temperature };
  if (tools.length) {
    body.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    body.tool_choice = "auto";
  }
  const res = await request(p, "/chat/completions", { method: "POST", body: JSON.stringify(body), signal: opts.signal });
  opts.onResponse?.(p.def.id, res.headers);
  if (!res.body) throw new ProviderError(`${p.def.name}: empty response`, p.def.id, 502);
  const acc = new Map<number, { id?: string; name: string; arguments: string }>();
  let finishReason: string | undefined;
  for await (const json of parseSSEChunks(res.body)) {
    const err = json.error as { message?: string } | string | undefined;
    if (err) throw new ProviderError(`${p.def.name}: ${typeof err === "string" ? err : (err.message ?? "stream error")}`, p.def.id);
    const choice = (json.choices as { delta?: { content?: string | null; tool_calls?: ToolDelta[] }; finish_reason?: string | null }[] | undefined)?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const d = choice.delta;
    if (d?.content) yield { type: "text", delta: d.content };
    for (const [pos, tc] of (d?.tool_calls ?? []).entries()) {
      let idx = tc.index ?? pos;
      // Some providers omit index (or reuse it) for separate calls; a new id means a new call.
      if (tc.id && acc.get(idx)?.id && acc.get(idx)!.id !== tc.id) idx = Math.max(...acc.keys()) + 1;
      const cur = acc.get(idx) ?? { name: "", arguments: "" };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.arguments += tc.function.arguments;
      acc.set(idx, cur);
    }
  }
  const calls = [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, c]) => ({ id: c.id || `call_${Date.now().toString(36)}_${i}`, name: c.name, arguments: c.arguments || "{}" }))
    .filter((c) => c.name);
  if (calls.length) yield { type: "tool_calls", calls };
  yield { type: "done", finishReason };
}
