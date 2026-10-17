import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONFIG,
  getProvider,
  loadConfig,
  maskKey,
  parseSSE,
  readyProviders,
  routeChat,
  saveConfig,
  type AtlasConfig,
  type RouteEvent,
} from "../src/index.js";

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      // Split mid-line to exercise buffering.
      const text = lines.join("\n") + "\n";
      c.enqueue(enc.encode(text.slice(0, 7)));
      c.enqueue(enc.encode(text.slice(7)));
      c.close();
    },
  });
}

const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}`;

function cfgWith(keys: Record<string, string>, order: string[]): AtlasConfig {
  return { ...structuredClone(DEFAULT_CONFIG), keys, order, provider: "auto" };
}

async function collect(it: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const s of it) out += s;
  return out;
}

describe("parseSSE", () => {
  it("joins deltas, skips junk, stops at [DONE]", async () => {
    const out = await collect(parseSSE(sse([": ping", delta("Sal"), "", delta("om"), "data: not-json", "data: [DONE]", delta("!")])));
    expect(out).toBe("Salom");
  });

  it("throws on in-stream error", async () => {
    await expect(collect(parseSSE(sse([`data: ${JSON.stringify({ error: { message: "quota" } })}`])))).rejects.toThrow("quota");
  });
});

describe("providers", () => {
  it("openrouter free filter", () => {
    const f = getProvider("openrouter")!.freeModelFilter!;
    expect(f({ id: "x/y:free", provider: "openrouter" })).toBe(true);
    expect(f({ id: "x/y", provider: "openrouter", pricing: { prompt: "0", completion: "0" } })).toBe(true);
    expect(f({ id: "x/y", provider: "openrouter", pricing: { prompt: "0.000001", completion: "0" } })).toBe(false);
  });

  it("ready providers need a key unless local", () => {
    const ready = readyProviders(cfgWith({ groq: "gsk_test" }, ["groq", "openrouter", "ollama"])).map((p) => p.def.id);
    expect(ready[0]).toBe("groq");
    expect(ready).toContain("ollama");
    expect(ready).not.toContain("openrouter");
  });

  it("masks keys", () => {
    expect(maskKey("sk-or-v1-abcdef123456")).toBe("sk-o…3456");
    expect(maskKey("short")).toBe("****");
  });
});

describe("config", () => {
  beforeEach(() => {
    process.env.ATLAS_HOME = mkdtempSync(join(tmpdir(), "atlas-"));
  });

  it("round-trips and fills defaults", () => {
    expect(loadConfig().provider).toBe("auto");
    const cfg = loadConfig();
    cfg.keys.groq = "k";
    saveConfig(cfg);
    const again = loadConfig();
    expect(again.keys.groq).toBe("k");
    expect(again.order.length).toBeGreaterThan(3);
  });
});

describe("routeChat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back on 429 and reports events", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("groq")) return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 });
        return new Response(sse([delta("ok"), "data: [DONE]"]), { status: 200 });
      }),
    );
    const events: RouteEvent[] = [];
    const out = await collect(
      routeChat(cfgWith({ groq: "a", gemini: "b" }, ["groq", "gemini"]), [{ role: "user", content: "hi" }], { onEvent: (e) => events.push(e) }),
    );
    expect(out).toBe("ok");
    expect(calls[0]).toContain("api.groq.com");
    expect(calls[1]).toContain("generativelanguage");
    expect(events.map((e) => e.type)).toEqual(["provider", "fallback", "provider"]);
  });

  it("does not fall back on 400", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
    await expect(collect(routeChat(cfgWith({ groq: "a", gemini: "b" }, ["groq", "gemini"]), [{ role: "user", content: "hi" }]))).rejects.toThrow("HTTP 400");
  });

  it("explicit provider without key gives a hint", async () => {
    await expect(collect(routeChat(cfgWith({}, []), [], { provider: "groq" }))).rejects.toThrow("atlas keys add groq");
  });
});

describe("serve", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses model routing", async () => {
    const { parseModel } = await import("../src/serve.js");
    const cfg = cfgWith({}, []);
    expect(parseModel(cfg, "auto")).toEqual({ provider: "auto" });
    expect(parseModel(cfg, "groq/llama-3.3-70b")).toEqual({ provider: "groq", model: "llama-3.3-70b" });
    expect(parseModel(cfg, "openrouter/meta-llama/x:free")).toEqual({ provider: "openrouter", model: "meta-llama/x:free" });
    expect(parseModel(cfg, "gpt-4o")).toEqual({ provider: "auto" });
  });

  it("requires token, proxies with fallback", async () => {
    const { startServer } = await import("../src/serve.js");
    const realFetch = globalThis.fetch;
    const server = await startServer(cfgWith({ groq: "a", gemini: "b" }, ["groq", "gemini"]), { port: 0, token: "t0ken" });
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    try {
      expect((await realFetch(`${base}/v1/models`)).status).toBe(401);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          if (url.includes("groq")) return new Response("{}", { status: 503 });
          const sent = JSON.parse(String(init.body)) as { model: string; tools?: unknown };
          return new Response(JSON.stringify({ model: sent.model, tools: sent.tools }), { status: 200, headers: { "content-type": "application/json" } });
        }),
      );
      const res = await realFetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: "Bearer t0ken", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "auto", messages: [], tools: [{ type: "function" }] }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-atlas-provider")).toBe("gemini");
      expect(await res.json()).toEqual({ model: "gemini-2.5-flash", tools: [{ type: "function" }] });
    } finally {
      server.close();
    }
  });
});
