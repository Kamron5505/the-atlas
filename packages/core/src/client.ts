import type { ResolvedProvider } from "./config.js";
import type { ModelInfo } from "./providers.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
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
