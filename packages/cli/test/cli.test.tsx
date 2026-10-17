import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "@the-atlas/core";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAuth, findAgent, loadAgents, parseCatalog } from "../src/agents/catalog.js";
import { AgentMenu, sortRows, type MenuRow } from "../src/agents/Menu.js";
import { atlasWiring } from "../src/agents/run.js";
import { Chat } from "../src/ui/Chat.js";
import { t } from "../src/i18n.js";

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ENTER = "\r";

beforeEach(() => {
  process.env.ATLAS_HOME = mkdtempSync(join(tmpdir(), "atlas-cli-"));
});

describe("catalog", () => {
  it("loads the bundled 47 agents", () => {
    const agents = loadAgents();
    expect(agents.length).toBeGreaterThanOrEqual(45);
    expect(findAgent(agents, "AIDER")?.binary).toBe("aider");
    expect(findAgent(agents, "gemini")?.name).toBe("Gemini CLI");
  });

  it("classifies auth like Aidevix (🆓 wins)", () => {
    expect(classifyAuth("🆓 bepul tier — 🌐 Google login")).toBe("free");
    expect(classifyAuth("💳 GitHub + Copilot obunasi")).toBe("paid");
    expect(classifyAuth("🌐 Cursor hisobiga login")).toBe("browser");
    expect(classifyAuth("🔑 OPENAI_API_KEY")).toBe("key");
  });

  it("skips malformed lines", () => {
    expect(parseCatalog("# c\nA|a|a|i|d|Chat\nbroken|line\n\n")).toHaveLength(1);
  });
});

describe("agents menu", () => {
  const agents = parseCatalog("Alpha|alpha|alpha||first|Chat|🆓\nBeta|beta|beta||second|Coding|🔑\nGamma|gamma|gamma||third|Coding|💳");
  const rows: MenuRow[] = agents.map((agent, i) => ({ agent, installed: i === 2, uses: i === 1 ? 5 : 0, last: false }));

  it("sorts installed first, then by usage", () => {
    expect(sortRows(rows).map((r) => r.agent.name)).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("filters by typing and launches with Enter", async () => {
    const onPick = vi.fn();
    const ui = render(<AgentMenu rows={rows} L={t("en")} onPick={onPick} />);
    await tick();
    ui.stdin.write("bet");
    await tick();
    expect(ui.lastFrame()).toContain("Beta");
    expect(ui.lastFrame()).not.toContain("Gamma");
    ui.stdin.write(ENTER);
    await tick();
    expect(onPick).toHaveBeenCalledWith({ agent: agents[1], free: false });
  });
});

describe("atlas wiring", () => {
  it("points aider at the proxy", () => {
    const w = atlasWiring(parseCatalog("Aider|aider|aider||x|Pair")[0]!, "http://127.0.0.1:1/v1", "tok");
    expect(w.env.OPENAI_API_BASE).toBe("http://127.0.0.1:1/v1");
    expect(w.env.OPENAI_API_KEY).toBe("tok");
    expect(w.args).toContain("openai/auto");
  });
});

const sseBody = (text: string) => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n`));
      c.close();
    },
  });
};

describe("chat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens the connect wizard when no AI is connected", async () => {
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: {}, order: ["groq"] };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="en" />);
    await tick();
    expect(ui.lastFrame()).toContain("none yet");
    expect(ui.lastFrame()).toContain("Which AI do you want to connect?");
    expect(ui.lastFrame()).toContain("OpenRouter");
  });

  it("slash menu autocompletes and /help works", async () => {
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "k" }, order: ["groq"] };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="en" />);
    await tick();
    ui.stdin.write("/he");
    await tick();
    expect(ui.lastFrame()).toContain("/help");
    ui.stdin.write(ENTER);
    await tick();
    expect(ui.lastFrame()).toContain("/provider");
  });

  it("arrow up recalls the previous message, esc clears input", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sseBody("ok"), { status: 200 })));
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "k" }, order: ["groq"] };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="en" />);
    await tick();
    ui.stdin.write("first question");
    await tick();
    ui.stdin.write(ENTER);
    await tick(150);
    ui.stdin.write("\u001b[A");
    await tick();
    // once in the transcript, once recalled into the input line
    expect(ui.lastFrame()!.split("› first question").length - 1).toBe(2);
    ui.stdin.write("\u001b");
    await tick(80);
    expect(ui.lastFrame()).toContain("Ask anything");
  });

  it("streams an answer with provider meta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sseBody("Salom!"), { status: 200 })));
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "k" }, order: ["groq"] };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="uz" />);
    await tick();
    ui.stdin.write("hi");
    await tick();
    ui.stdin.write(ENTER);
    await tick(150);
    expect(ui.lastFrame()).toContain("Salom!");
    expect(ui.lastFrame()).toContain("groq/llama-3.3-70b-versatile");
  });

  it("on free limit offers to switch AI and retries the question", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("groq")) return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), { status: 429 });
        return new Response(sseBody("Gemini javobi"), { status: 200 });
      }),
    );
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "a", gemini: "b" }, order: ["groq", "gemini"], provider: "groq" };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="en" />);
    await tick();
    ui.stdin.write("savol");
    await tick();
    ui.stdin.write(ENTER);
    await tick(120);
    expect(ui.lastFrame()).toContain("Free limit reached on groq");
    expect(ui.lastFrame()).toContain("Switch to Google Gemini");
    ui.stdin.write(ENTER);
    await tick(150);
    expect(ui.lastFrame()).toContain("Gemini javobi");
    expect(urls.at(-1)).toContain("generativelanguage");
  });
});

describe("logo intro", () => {
  it("types ATLAS letter by letter on a terminal", async () => {
    const { printLogo, logoRows } = await import("../src/ui/intro.js");
    const out: string[] = [];
    const stdout = process.stdout as unknown as { isTTY: boolean; columns: number; write: (s: string) => boolean };
    const saved = { isTTY: stdout.isTTY, columns: stdout.columns, write: stdout.write };
    Object.assign(stdout, { isTTY: true, columns: 100, write: (s: string) => (out.push(s), true) });
    delete process.env.ATLAS_NO_ANIM;
    try {
      await printLogo();
    } finally {
      Object.assign(stdout, saved);
    }
    const all = out.join("");
    expect(all.split("\u001b[6A").length - 1).toBe(4); // 5 frames, cursor goes back 4 times
    expect(logoRows(5, false)[0]).toContain("█████╗ ████████╗");
    expect(all).toContain("\u001b[?25h"); // cursor restored
  });
});
