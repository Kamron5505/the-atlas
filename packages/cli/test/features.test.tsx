import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "@the-atlas/core";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeMention, applyCompletion, completePath, prepareMessage } from "../src/attach.js";
import { t } from "../src/i18n.js";
import { formatLimit, isLow, limitFor, parseRateHeaders, recordLimited, recordRequest } from "../src/limits.js";
import { lastSession, listSessions, loadSession, newSession, saveSession, toMarkdown } from "../src/session.js";
import { claudeUsedPct, contextBar, gradient, renderStatusline, usageEmoji } from "../src/statusline.js";
import { Chat } from "../src/ui/Chat.js";
import { Compare, compareTargets } from "../src/ui/Compare.js";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const ENTER = "\r";
const strip = (s = "") => s.replace(/\u001b\[[0-9;]*m/g, "");
const sse = (text: string) => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n`));
      c.close();
    },
  });
};

let home = "";
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "atlas-feat-"));
  process.env.ATLAS_HOME = home;
});
afterEach(() => vi.unstubAllGlobals());

describe("sessions", () => {
  it("saves, lists newest first, resumes by folder, exports markdown", async () => {
    const a = newSession("C:\\proj", "groq");
    a.messages = [
      { role: "user", content: "Salom, kod yozib ber" },
      { role: "assistant", content: "```js\nconsole.log(1)\n```" },
    ];
    a.meta = ["groq/llama"];
    saveSession(a);
    await tick(15);
    const b = newSession("C:\\other", "gemini");
    b.messages = [{ role: "user", content: "second" }];
    saveSession(b);
    expect(listSessions().map((s) => s.title)).toEqual(["second", "Salom, kod yozib ber"]);
    expect(lastSession("c:\\PROJ")?.id).toBe(a.id);
    expect(loadSession(a.id)?.meta).toEqual(["groq/llama"]);
    const md = toMarkdown(a);
    expect(md).toContain("# Salom, kod yozib ber");
    expect(md).toContain("**Atlas** · groq/llama");
  });

  it("does not write empty chats", () => {
    saveSession(newSession("C:\\x", "auto"));
    expect(listSessions()).toEqual([]);
  });
});

describe("@file attachments", () => {
  it("inlines text files, images as data URLs, folders as listings; skips missing/binary", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-att-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "app.ts"), "const a = 1;\nexport default a;\n");
    writeFileSync(join(dir, "logo.png"), Buffer.from([137, 80, 78, 71]));
    writeFileSync(join(dir, "blob.bin"), Buffer.from([1, 0, 2, 0]));
    const p = prepareMessage("@src/app.ts @logo.png @src @nope.ts @blob.bin nima xato?", dir);
    expect(p.attached.map((x) => `${x.path}:${x.kind}`)).toEqual(["src/app.ts:text", "logo.png:image", "src:dir"]);
    expect(p.skipped.map((x) => x.path)).toEqual(["nope.ts", "blob.bin"]);
    expect(Array.isArray(p.content)).toBe(true);
    const parts = p.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts[0]!.text).toContain('<file path="src/app.ts">');
    expect(parts[0]!.text).toContain("export default a;");
    expect(parts[1]!.image_url!.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("completes paths while typing @", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-cmp-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "app.ts"), "");
    writeFileSync(join(dir, "src", "api.ts"), "");
    mkdirSync(join(dir, "node_modules"));
    expect(activeMention("look at @sr")).toBe("sr");
    expect(activeMention("no mention")).toBeUndefined();
    expect(completePath("sr", dir)).toEqual(["src/"]);
    expect(completePath("src/ap", dir)).toEqual(["src/api.ts", "src/app.ts"]);
    expect(completePath("node", dir)).toEqual([]);
    expect(applyCompletion("see @src/ap", "src/app.ts")).toBe("see @src/app.ts");
  });
});

describe("limits", () => {
  it("reads per-day counters (Groq/Cerebras) before per-minute ones", () => {
    const h = new Headers({
      "x-ratelimit-limit-requests-day": "14400",
      "x-ratelimit-remaining-requests-day": "14000",
      "x-ratelimit-limit-requests-minute": "30",
      "x-ratelimit-remaining-requests-minute": "29",
      "x-ratelimit-remaining-tokens-minute": "5000",
    });
    expect(parseRateHeaders(h)).toEqual({ remaining: 14000, limit: 14400, window: "day", source: "header" });
    expect(parseRateHeaders(new Headers({ "x-ratelimit-limit": "20", "x-ratelimit-remaining": "3" }))?.remaining).toBe(3);
    expect(parseRateHeaders(new Headers({ "content-type": "text/plain" }))).toBeUndefined();
  });

  it("estimates quotas for header-less providers and flags low ones", () => {
    for (let i = 0; i < 44; i++) recordRequest("openrouter");
    const l = limitFor("openrouter")!;
    expect(formatLimit(l)).toBe("≈6/50");
    expect(isLow(l)).toBe(true);
    recordLimited("gemini");
    expect(limitFor("gemini")!.remaining).toBe(0);
  });
});

describe("status line", () => {
  it("gradient endpoints, emoji thresholds and 20-block bar", () => {
    expect(gradient(0)).toEqual([0, 200, 80]);
    expect(gradient(0.5)).toEqual([220, 200, 0]);
    expect(gradient(1)).toEqual([220, 40, 20]);
    expect([5, 20, 69, 70, 89, 90].map(usageEmoji)).toEqual(["🟢", "⚡️", "⚡️", "🔥", "🔥", "🚨"]);
    // Explicit style: the shell running tests may set NO_COLOR.
    const bar = contextBar(50, 20, { depth: 24, emoji: true, unicode: true });
    expect(strip(bar)).toBe("█".repeat(20));
    expect(bar.match(/38;2;60;60;60m/g)).toHaveLength(10);
  });

  it("renders all elements in order with dim pipes", () => {
    const line = strip(renderStatusline({ repo: "the-atlas", branch: "main", usedPct: 47, costUsd: 0.4213, added: 12, removed: 3, model: "Opus 5.5" }, { depth: 24, emoji: true, unicode: true }));
    expect(line).toBe(`the-atlas | 🌿 (main) | ⚡️ ${"█".repeat(20)} 47% | $0.42 | +12 -3 | 🤖 Opus 5.5`);
  });

  it("computes Claude context % per docs (input tokens only)", () => {
    expect(claudeUsedPct({ context_window: { used_percentage: 33 } })).toBe(33);
    expect(
      claudeUsedPct({ context_window: { context_window_size: 200000, used_percentage: null, current_usage: { input_tokens: 10000, cache_creation_input_tokens: 500, cache_read_input_tokens: 5000 } } }),
    ).toBeCloseTo(7.75);
    expect(claudeUsedPct({})).toBe(0);
  });
});

describe("compare", () => {
  it("picks targets: explicit list or connected AIs", () => {
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "a", gemini: "b", mistral: "c", cerebras: "d" } };
    expect(compareTargets(cfg, [])).toHaveLength(3);
    expect(compareTargets(cfg, ["groq/llama-x", "gemini", "nope"])).toEqual([{ provider: "groq", model: "llama-x" }, { provider: "gemini" }]);
  });

  it("streams several AIs, marks the fastest and lets you keep one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("groq")) return new Response(sse("Groq javobi"), { status: 200 });
        await tick(60);
        return new Response(sse("Gemini javobi"), { status: 200 });
      }),
    );
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "a", gemini: "b" } };
    const onDone = vi.fn();
    const ui = render(
      <Compare cfg={cfg} L={t("en")} width={100} targets={[{ provider: "groq" }, { provider: "gemini" }]} messages={[{ role: "user", content: "hi" }]} onDone={onDone} />,
    );
    await tick(250);
    const frame = strip(ui.lastFrame());
    expect(frame).toContain("Groq javobi");
    expect(frame).toContain("Gemini javobi");
    expect(frame).toContain("fastest");
    ui.stdin.write("\u001b[C"); // → choose second
    await tick();
    ui.stdin.write(ENTER);
    await tick();
    expect(onDone.mock.calls[0]![1].provider).toBe("gemini");
  });
});

describe("chat integration", () => {
  it("attaches @files, saves the chat and shows the status line", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return new Response(sse("Fayl ko'rildi"), { status: 200, headers: { "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": "990" } });
      }),
    );
    const dir = mkdtempSync(join(tmpdir(), "atlas-chat-"));
    writeFileSync(join(dir, "note.txt"), "secret sauce\n");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "k" }, order: ["groq"], provider: "groq" };
      const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="en" />);
      await tick();
      ui.stdin.write("@note.txt what is inside?");
      await tick();
      ui.stdin.write(ENTER);
      await tick(200);
      const frame = strip(ui.lastFrame());
      expect(frame).toContain("note.txt · 2 lines · attached");
      expect(frame).toContain("Fayl ko'rildi");
      expect(frame).toContain("🤖 groq/llama-3.3-70b-versatile 99"); // "990/1000" is cut at test width
      const body = calls[0] as { messages: { content: string }[] };
      expect(body.messages.at(-1)!.content).toContain("secret sauce");
      expect(listSessions()[0]!.title).toBe("@note.txt what is inside?");
      ui.stdin.write("/export");
      await tick();
      ui.stdin.write(ENTER);
      await tick();
      const md = readFileSync(join(dir, `atlas-chat-${listSessions()[0]!.id}.md`), "utf8");
      expect(md).toContain("Fayl ko'rildi");
    } finally {
      process.chdir(cwd);
    }
  });

  it("/history restores a saved chat", async () => {
    const s = newSession(process.cwd(), "groq");
    s.messages = [
      { role: "user", content: "eski savol" },
      { role: "assistant", content: "eski javob" },
    ];
    s.meta = ["groq/x"];
    saveSession(s);
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "k" }, order: ["groq"] };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="en" />);
    await tick();
    ui.stdin.write("/history");
    await tick();
    ui.stdin.write(ENTER);
    await tick();
    expect(strip(ui.lastFrame())).toContain("Which chat should we continue?");
    ui.stdin.write(ENTER);
    await tick();
    const frame = strip(ui.lastFrame());
    expect(frame).toContain("Chat restored");
    expect(frame).toContain("eski javob");
  });
});
