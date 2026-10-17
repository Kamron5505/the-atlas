import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "@the-atlas/core";
import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAuth, findAgent, loadAgents, parseCatalog } from "../src/agents/catalog.js";
import { AgentMenu, sortRows, type MenuRow } from "../src/agents/Menu.js";
import { atlasWiring } from "../src/agents/run.js";
import { Chat } from "../src/ui/Chat.js";

const tick = () => new Promise((r) => setTimeout(r, 30));

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
    const ui = render(<AgentMenu rows={rows} onPick={onPick} />);
    await tick();
    ui.stdin.write("bet");
    await tick();
    expect(ui.lastFrame()).toContain("Beta");
    expect(ui.lastFrame()).not.toContain("Gamma");
    ui.stdin.write("\r");
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

describe("chat", () => {
  it("shows banner, onboarding hint and /help", async () => {
    const cfg = { ...structuredClone(DEFAULT_CONFIG), order: [] as string[] };
    const ui = render(<Chat cfg={{ ...cfg, keys: {}, order: ["groq"] }} version="0.0.0" initialLang="en" />);
    await tick();
    expect(ui.lastFrame()).toContain("the-atlas v0.0.0");
    ui.stdin.write("/help");
    await tick();
    ui.stdin.write("\r");
    await tick();
    expect(ui.lastFrame()).toContain("/provider");
  });

  it("streams an answer with provider meta", async () => {
    const enc = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Salom!"}}]}\n\ndata: [DONE]\n')); c.close(); } }), { status: 200 })),
    );
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "k" }, order: ["groq"] };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="uz" />);
    await tick();
    ui.stdin.write("hi");
    await tick();
    ui.stdin.write("\r");
    await new Promise((r) => setTimeout(r, 150));
    expect(ui.lastFrame()).toContain("Salom!");
    expect(ui.lastFrame()).toContain("groq/llama-3.3-70b-versatile");
    vi.unstubAllGlobals();
  });
});
