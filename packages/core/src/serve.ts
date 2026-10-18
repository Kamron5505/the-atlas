import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { forwardRaw, ProviderError } from "./client.js";
import type { AtlasConfig } from "./config.js";
import { getProvider } from "./providers.js";
import { candidates } from "./router.js";

const MAX_BODY = 10 * 1024 * 1024;

export interface ServeOptions {
  port: number;
  host?: string;
  token: string;
  onLog?: (line: string) => void;
}

/** "groq/llama-3.3" → explicit provider; "auto"/unknown → fallback chain with provider defaults. */
export function parseModel(cfg: AtlasConfig, model: unknown): { provider: string; model?: string } {
  if (typeof model !== "string" || model === "" || model === "auto" || model === "atlas") return { provider: cfg.provider };
  const slash = model.indexOf("/");
  if (slash > 0) {
    const id = model.slice(0, slash);
    if (getProvider(id)) return { provider: id, model: model.slice(slash + 1) };
  }
  return { provider: "auto" };
}

/** HMAC-SHA256(token, nonce) as hex — answer to the /health identity challenge. */
export function healthProof(token: string, nonce: string): string {
  return createHmac("sha256", token).update(nonce).digest("hex");
}

function tokenOk(header: string | undefined, token: string): boolean {
  const got = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function chatCompletions(cfg: AtlasConfig, req: IncomingMessage, res: ServerResponse, log: (s: string) => void): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    return json(res, 400, { error: { message: "invalid JSON body" } });
  }
  const route = parseModel(cfg, body.model);
  let list;
  try {
    list = candidates(cfg, route.provider);
  } catch (err) {
    return json(res, 503, { error: { message: (err as Error).message } });
  }
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  const errors: string[] = [];
  for (const p of list) {
    const model = route.model ?? p.model;
    if (!model) {
      errors.push(`${p.def.name}: no model`);
      continue;
    }
    try {
      const upstream = await forwardRaw(p, "/chat/completions", { ...body, model }, abort.signal);
      log(`→ ${p.def.id}/${model} ${upstream.status}`);
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "X-Atlas-Provider": p.def.id,
        "X-Atlas-Model": model,
      });
      if (upstream.body) Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).pipe(res);
      else res.end();
      return;
    } catch (err) {
      if (abort.signal.aborted) return;
      if (!(err instanceof ProviderError) || !err.retryable) {
        const status = err instanceof ProviderError && err.status ? err.status : 502;
        return json(res, status, { error: { message: (err as Error).message } });
      }
      errors.push(err.message);
      log(`✗ ${err.message}`);
    }
  }
  json(res, 502, { error: { message: `All providers failed: ${errors.join("; ")}` } });
}

function modelsList(cfg: AtlasConfig) {
  const data = [{ id: "auto", object: "model", owned_by: "atlas" }];
  for (const p of candidates(cfg, "auto")) {
    if (p.model) data.push({ id: `${p.def.id}/${p.model}`, object: "model", owned_by: p.def.id });
  }
  return { object: "list", data };
}

/** Local OpenAI-compatible endpoint so any agent can use the free-model fallback chain. */
export function startServer(config: AtlasConfig | (() => AtlasConfig), opts: ServeOptions): Promise<Server> {
  const log = opts.onLog ?? (() => {});
  // A getter lets a long-running server pick up keys added after it started.
  const current = typeof config === "function" ? config : () => config;
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    const cfg = current();
    if (url === "/health") {
      // Proof of identity for `atlas run --free`: HMAC(token, nonce). Lets the client tell
      // a real Atlas server from another program on the port without revealing the token.
      const nonce = new URL(req.url ?? "/", "http://x").searchParams.get("nonce");
      return json(res, 200, nonce ? { status: "ok", proof: healthProof(opts.token, nonce) } : { status: "ok" });
    }
    if (!tokenOk(req.headers.authorization, opts.token)) return json(res, 401, { error: { message: "invalid atlas token" } });
    if (req.method === "GET" && (url === "/v1/models" || url === "/models")) {
      try {
        return json(res, 200, modelsList(cfg));
      } catch (err) {
        return json(res, 503, { error: { message: (err as Error).message } });
      }
    }
    if (req.method === "POST" && (url === "/v1/chat/completions" || url === "/chat/completions")) {
      chatCompletions(cfg, req, res, log).catch((err: Error) => {
        if (!res.headersSent) json(res, 500, { error: { message: err.message } });
        else res.end();
      });
      return;
    }
    json(res, 404, { error: { message: "not found" } });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host ?? "127.0.0.1", () => resolve(server));
  });
}
