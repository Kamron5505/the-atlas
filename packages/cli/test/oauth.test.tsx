import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "@the-atlas/core";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginOpenRouter } from "../src/oauth.js";
import { Chat } from "../src/ui/Chat.js";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  process.env.ATLAS_HOME = mkdtempSync(join(tmpdir(), "atlas-oauth-"));
});
afterEach(() => vi.unstubAllGlobals());

/** Plays the browser: follows the auth URL's callback with the given code/state. */
function browser(code: string, tamperState = false) {
  return (url: string) => {
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://openrouter.ai/auth");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cb = new URL(u.searchParams.get("callback_url")!);
    expect(cb.hostname).toBe("localhost");
    const state = tamperState ? "evil" : u.searchParams.get("state")!;
    // The callback server listens on loopback only.
    void fetch(`http://127.0.0.1:${cb.port}/callback?code=${code}&state=${state}`).catch(() => {});
  };
}

describe("OpenRouter sign-in (OAuth PKCE)", () => {
  it("returns the key after the browser redirect and exchanges code + verifier", async () => {
    const exchange = vi.fn(async (code: string, verifier: string) => {
      expect(code).toBe("abc123");
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return "sk-or-v1-test";
    });
    await expect(loginOpenRouter({ open: browser("abc123"), exchange })).resolves.toBe("sk-or-v1-test");
    expect(exchange).toHaveBeenCalledOnce();
  });

  it("rejects a callback with a wrong state (CSRF)", async () => {
    const exchange = vi.fn(async () => "never");
    await expect(loginOpenRouter({ open: browser("abc", true), exchange })).rejects.toThrow("invalid callback");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("can be cancelled", async () => {
    const ctrl = new AbortController();
    const p = loginOpenRouter({ open: () => setTimeout(() => ctrl.abort(), 20), signal: ctrl.signal });
    await expect(p).rejects.toThrow("cancelled");
  });
});

describe("Atlas identity", () => {
  it("every chat request starts with the Atlas system prompt", async () => {
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const enc = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Men Atlasman"}}]}\n\ndata: [DONE]\n'));
              c.close();
            },
          }),
          { status: 200 },
        );
      }),
    );
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: { groq: "k" }, order: ["groq"], provider: "groq" };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="uz" />);
    await tick();
    ui.stdin.write("sen kimsan?");
    await tick();
    ui.stdin.write("\r");
    await tick(150);
    const first = bodies[0]!.messages[0]!;
    expect(first.role).toBe("system");
    expect(first.content).toContain("You are Atlas");
  });

  it("first run offers browser sign-in for OpenRouter", async () => {
    const cfg = { ...structuredClone(DEFAULT_CONFIG), keys: {}, order: ["openrouter"] };
    const ui = render(<Chat cfg={cfg} version="0.0.0" initialLang="ru" />);
    await tick();
    expect(ui.lastFrame()).toContain("1 клик, вход через браузер");
  });
});
