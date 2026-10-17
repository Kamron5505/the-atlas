import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearModelCaches,
  DEFAULT_CONFIG,
  messageText,
  parseSSEChunks,
  resolveProvider,
  routeAgentStep,
  streamChatTools,
  type AtlasConfig,
  type RouteEvent,
  type ToolStreamEvent,
} from "../src/index.js";

/** SSE body split into fixed-size chunks so JSON lines break mid-way. */
function sseChunks(events: unknown[], size = 13): ReadableStream<Uint8Array> {
  const text = events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`).join("");
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < text.length; i += size) c.enqueue(enc.encode(text.slice(i, i + size)));
      c.close();
    },
  });
}

const tc = (index: number, fn: { name?: string; arguments?: string }, id?: string) => ({
  choices: [{ delta: { tool_calls: [{ index, ...(id ? { id } : {}), type: "function", function: fn }] } }],
});

async function all(it: AsyncIterable<ToolStreamEvent>): Promise<ToolStreamEvent[]> {
  const out: ToolStreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const cfg = (over: Partial<AtlasConfig> = {}): AtlasConfig => ({ ...structuredClone(DEFAULT_CONFIG), keys: { groq: "gsk_test" }, ...over });

beforeEach(() => {
  process.env.ATLAS_HOME = mkdtempSync(join(tmpdir(), "atlas-tools-"));
  clearModelCaches();
});
afterEach(() => vi.unstubAllGlobals());

describe("parseSSEChunks", () => {
  it("parses split lines and stops at [DONE]", async () => {
    const out: unknown[] = [];
    for await (const j of parseSSEChunks(sseChunks([{ a: 1 }, "junk", { b: 2 }, "[DONE]", { c: 3 }], 5))) out.push(j);
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe("streamChatTools", () => {
  it("accumulates tool_call deltas by index, yields text, generates missing ids", async () => {
    const body = sseChunks([
      { choices: [{ delta: { content: "Let me " } }] },
      { choices: [{ delta: { content: "look." } }] },
      tc(0, { name: "read_", arguments: "" }, "call_a"),
      tc(0, { name: "file", arguments: '{"pa' }),
      tc(1, { name: "list_dir", arguments: "{}" }),
      tc(0, { arguments: 'th":"a.ts"}' }),
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      "[DONE]",
    ]);
    let sent: Record<string, unknown> = {};
    const onResponse = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(body, { status: 200 });
      }),
    );
    const p = resolveProvider(cfg(), "groq")!;
    const events = await all(
      streamChatTools(p, [{ role: "user", content: "hi" }], [{ name: "read_file", description: "d", parameters: { type: "object" } }], { onResponse }),
    );
    expect(events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toBe("Let me look.");
    const calls = events.find((e) => e.type === "tool_calls") as Extract<ToolStreamEvent, { type: "tool_calls" }>;
    expect(calls.calls[0]).toEqual({ id: "call_a", name: "read_file", arguments: '{"path":"a.ts"}' });
    expect(calls.calls[1]!.name).toBe("list_dir");
    expect(calls.calls[1]!.id).toMatch(/^call_/);
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "tool_calls" });
    expect(sent.tool_choice).toBe("auto");
    expect((sent.tools as { type: string; function: { name: string } }[])[0]).toMatchObject({ type: "function", function: { name: "read_file" } });
    expect(onResponse).toHaveBeenCalledWith("groq", expect.any(Headers));
  });

  it("keeps separate calls apart when a provider omits index (Gemini-style)", async () => {
    const whole = (id: string, name: string, args: string) => ({ choices: [{ delta: { tool_calls: [{ id, type: "function", function: { name, arguments: args } }] } }] });
    const body = sseChunks([whole("c1", "read_file", '{"path":"a"}'), whole("c2", "list_dir", "{}"), "[DONE]"]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const events = await all(streamChatTools(resolveProvider(cfg(), "groq")!, [{ role: "user", content: "hi" }], []));
    const calls = (events.find((e) => e.type === "tool_calls") as Extract<ToolStreamEvent, { type: "tool_calls" }>).calls;
    expect(calls).toEqual([
      { id: "c1", name: "read_file", arguments: '{"path":"a"}' },
      { id: "c2", name: "list_dir", arguments: "{}" },
    ]);
  });

  it("messageText is null-safe", () => {
    expect(messageText({ role: "assistant", content: null as unknown as string })).toBe("");
  });
});

describe("routeAgentStep", () => {
  it("falls back when a provider rejects tools, before any output", async () => {
    const hits: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        hits.push(url);
        if (url.includes("groq")) return Response.json({ error: { message: "model does not support tool use" } }, { status: 400 });
        if (url.endsWith("/chat/completions")) return new Response(sseChunks([{ choices: [{ delta: { content: "ok" } }] }, "[DONE]"]), { status: 200 });
        return new Response("no", { status: 404 });
      }),
    );
    const events: RouteEvent[] = [];
    const c = cfg({ keys: { groq: "gsk_test", gemini: "g_test" }, order: ["groq", "gemini"] });
    const out = await all(routeAgentStep(c, [{ role: "user", content: "hi" }], [], { onEvent: (e) => events.push(e) }));
    expect(out[0]).toEqual({ type: "text", delta: "ok" });
    expect(events.map((e) => `${e.type}:${e.provider}`)).toEqual(["provider:groq", "fallback:groq", "provider:gemini"]);
  });

  it("does not fall back on a plain 400", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "bad request" } }, { status: 400 })));
    const c = cfg({ keys: { groq: "gsk_test", gemini: "g_test" }, order: ["groq", "gemini"] });
    await expect(all(routeAgentStep(c, [{ role: "user", content: "hi" }], []))).rejects.toThrow("HTTP 400");
  });
});
