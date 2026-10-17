import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStatusline, usageMarker, type StatusStyle } from "../src/statusline.js";
import { ansi16, ansi256, colorDepth, emojiSupported, fgCode, paint, pipedColorDepth, unicodeSupported, type ColorDepth } from "../src/ui/term.js";

const KEYS = [
  "NO_COLOR", "FORCE_COLOR", "TERM", "TERM_PROGRAM", "COLORTERM", "WT_SESSION", "WEZTERM_PANE",
  "ATLAS_ASCII", "ATLAS_UNICODE", "TERMINUS_SUBLIME", "ConEmuTask", "TERMINAL_EMULATOR", "ATLAS_NO_ANIM",
];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

const tty = (depth = 24) => ({ isTTY: true, getColorDepth: () => depth });
const pipe = { isTTY: false };
const env = (vars: Record<string, string>) => Object.assign(process.env, vars);
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

describe("colorDepth env matrix", () => {
  const cases: [string, Record<string, string>, { isTTY: boolean; getColorDepth?: () => number }, ColorDepth][] = [
    ["NO_COLOR wins over everything", { NO_COLOR: "1", FORCE_COLOR: "3", WT_SESSION: "x" }, tty(), 1],
    ["FORCE_COLOR=0", { FORCE_COLOR: "0", COLORTERM: "truecolor" }, tty(), 1],
    ["FORCE_COLOR=1 on a pipe", { FORCE_COLOR: "1" }, pipe, 4],
    ["FORCE_COLOR=2", { FORCE_COLOR: "2" }, pipe, 8],
    ["FORCE_COLOR=3", { FORCE_COLOR: "3" }, pipe, 24],
    ["non-TTY (CI, file) is plain", { WT_SESSION: "x", COLORTERM: "truecolor" }, pipe, 1],
    ["TERM=dumb", { TERM: "dumb" }, tty(), 1],
    ["Windows Terminal", { WT_SESSION: "abc" }, tty(4), 24],
    ["VS Code", { TERM_PROGRAM: "vscode" }, tty(4), 24],
    ["iTerm2", { TERM_PROGRAM: "iTerm.app" }, tty(4), 24],
    ["WezTerm", { WEZTERM_PANE: "0" }, tty(4), 24],
    ["COLORTERM=24bit", { COLORTERM: "24bit" }, tty(4), 24],
    ["macOS Terminal.app has no truecolor", { TERM_PROGRAM: "Apple_Terminal", TERM: "xterm-256color", COLORTERM: "truecolor" }, tty(24), 8],
    ["xterm-256color", { TERM: "xterm-256color" }, tty(4), 8],
    ["Linux console", { TERM: "linux" }, tty(24), 4],
    ["falls back to the stream", {}, tty(8), 8],
    ["legacy conhost via stream", {}, tty(4), 4],
  ];
  it.each(cases)("%s", (_name, vars, stream, want) => {
    env(vars);
    expect(colorDepth(stream)).toBe(want);
  });

  it("piped status line stays truecolor unless env says otherwise", () => {
    expect(pipedColorDepth()).toBe(24);
    env({ TERM_PROGRAM: "Apple_Terminal" });
    expect(pipedColorDepth()).toBe(8);
    env({ NO_COLOR: "1" });
    expect(pipedColorDepth()).toBe(1);
  });
});

describe("unicode / emoji support", () => {
  const win = process.platform === "win32";

  it("ATLAS_ASCII and ATLAS_UNICODE override detection", () => {
    env({ ATLAS_ASCII: "1", WT_SESSION: "x" });
    expect(unicodeSupported(tty())).toBe(false);
    expect(emojiSupported(tty())).toBe(false);
    delete process.env.ATLAS_ASCII;
    env({ ATLAS_UNICODE: "1", TERM: "linux" });
    expect(unicodeSupported(tty())).toBe(true);
  });

  it("piped output is UTF-8: unicode and emoji on", () => {
    expect(unicodeSupported(pipe)).toBe(true);
    expect(emojiSupported(pipe)).toBe(true);
  });

  it("Linux VT and TERM=dumb get ASCII", () => {
    env({ TERM: "linux" });
    expect(unicodeSupported(tty())).toBe(false);
    env({ TERM: "dumb" });
    expect(unicodeSupported(tty())).toBe(false);
  });

  it("Windows Terminal / VS Code: unicode + emoji", () => {
    env({ WT_SESSION: "x" });
    expect(unicodeSupported(tty())).toBe(true);
    expect(emojiSupported(tty())).toBe(true);
    delete process.env.WT_SESSION;
    env({ TERM_PROGRAM: "vscode" });
    expect(emojiSupported(tty())).toBe(true);
  });

  it.runIf(win)("legacy conhost (no WT_SESSION, no TERM): ASCII, no emoji", () => {
    expect(unicodeSupported(tty())).toBe(false);
    expect(emojiSupported(tty())).toBe(false);
  });

  it.runIf(win)("Git Bash mintty: unicode but no colour emoji", () => {
    env({ TERM: "xterm-256color" });
    expect(unicodeSupported(tty())).toBe(true);
    expect(emojiSupported(tty())).toBe(false);
  });

  it.runIf(!win)("macOS / Linux terminals: unicode + emoji", () => {
    env({ TERM_PROGRAM: "Apple_Terminal", TERM: "xterm-256color" });
    expect(unicodeSupported(tty())).toBe(true);
    expect(emojiSupported(tty())).toBe(true);
  });
});

describe("colour downgrade", () => {
  it("maps to the 256 cube and grays", () => {
    expect(ansi256(0, 229, 255)).toBe(16 + 36 * 0 + 6 * 4 + 5); // neon #00E5FF → 45
    expect(ansi256(255, 0, 0)).toBe(196);
    expect(ansi256(0, 0, 0)).toBe(16);
    expect(ansi256(255, 255, 255)).toBe(231);
    const g = ansi256(128, 128, 128);
    expect(g).toBeGreaterThanOrEqual(232);
    expect(g).toBeLessThanOrEqual(255);
  });

  it("maps to the 16 basic colours", () => {
    expect(ansi16(0, 229, 255)).toBe(96); // bright cyan
    expect(ansi16(220, 40, 20)).toBe(31);
    expect(ansi16(0, 0, 0)).toBe(30);
    expect(ansi16(255, 255, 255)).toBe(97);
  });

  it("fgCode per depth", () => {
    expect(fgCode(1, 2, 3, 24)).toBe("\u001b[38;2;1;2;3m");
    expect(fgCode(255, 0, 0, 8)).toBe("\u001b[38;5;196m");
    expect(fgCode(255, 0, 0, 4)).toMatch(/^\u001b\[(31|91)m$/);
    expect(fgCode(255, 0, 0, 1)).toBe("");
  });

  it("paint() is a no-op at depth 1", () => {
    expect(paint([0, 229, 255], "atlas", 1)).toBe("atlas");
    expect(paint([0, 229, 255], "atlas", 8)).toBe("\u001b[38;5;45matlas\u001b[39m");
  });

  it("logo is still a gradient at 256 colours and plain at depth 1", async () => {
    const { logoRows } = await import("../src/ui/intro.js");
    const rows = logoRows(5, 8);
    const codes = new Set(rows.join("").match(/38;5;\d+/g));
    expect(codes.size).toBeGreaterThanOrEqual(3);
    expect(rows.join("")).not.toContain("38;2;");
    expect(logoRows(5, 1).join("")).not.toContain("\u001b");
    expect(strip(rows[0]!)).toBe(logoRows(5, false)[0]);
  });
});

describe("status line ASCII mode", () => {
  const ascii: StatusStyle = { depth: 1, emoji: false, unicode: false };
  const data = { repo: "the-atlas", branch: "main", usedPct: 47, costUsd: 0.4213, added: 12, removed: 3, model: "Opus 5.5" };

  it("uses text markers and #/. bar, no escapes at depth 1", () => {
    const line = renderStatusline(data, ascii);
    expect(line).toBe(`the-atlas | br:(main) | MID ${"#".repeat(9)}${".".repeat(11)} 47% | $0.42 | +12 -3 | ai: Opus 5.5`);
    expect(line).toMatch(/^[\x20-\x7e]+$/);
  });

  it("markers per threshold", () => {
    expect([5, 20, 70, 90].map((p) => usageMarker(p, false))).toEqual(["OK", "MID", "HOT", "MAX"]);
  });

  it("emoji off but colour on: 256-colour escapes only", () => {
    const line = renderStatusline(data, { depth: 8, emoji: false, unicode: true });
    expect(line).not.toContain("38;2;");
    expect(line).toContain("38;5;");
    expect(strip(line)).toContain("█");
    expect(strip(line)).not.toMatch(/[🌿🤖⚡]/u);
  });
});

describe("glyph fallback", () => {
  it("ASCII glyphs, spinner and spark when unicode is unsupported", async () => {
    env({ ATLAS_ASCII: "1" });
    vi.resetModules();
    const t = await import("../src/ui/theme.js");
    expect(t.I).toEqual(t.ASCII_GLYPHS);
    expect(t.I.ok).toBe("+");
    expect(t.I.fail).toBe("x");
    expect(t.I.sub).toBe("|_");
    expect(t.I.arrow).toBe("->");
    expect(t.SPINNER).toBe("line");
    for (const g of [...Object.values(t.I), ...t.SPARK]) expect(g).toMatch(/^[\x20-\x7e]+$/);
  });

  it("Unicode glyphs otherwise", async () => {
    env({ ATLAS_UNICODE: "1" });
    vi.resetModules();
    const t = await import("../src/ui/theme.js");
    expect(t.I.ok).toBe("✔");
    expect(t.SPINNER).toBe("dots");
  });

  it("compact logo line in ASCII mode, with one empty line above and below", async () => {
    env({ ATLAS_ASCII: "1", ATLAS_NO_ANIM: "1" });
    vi.resetModules();
    const { printLogo } = await import("../src/ui/intro.js");
    const out = await capture(printLogo, { isTTY: true, columns: 120 });
    expect(strip(out)).toBe("\r\n  # A T L A S\n\n");
  });

  it("static block logo keeps the top and bottom margin", async () => {
    env({ ATLAS_UNICODE: "1", ATLAS_NO_ANIM: "1" });
    vi.resetModules();
    const { printLogo } = await import("../src/ui/intro.js");
    const out = strip(await capture(printLogo, { isTTY: true, columns: 120 }));
    expect(out.startsWith("\r\n  ")).toBe(true);
    expect(out.split("\n")[1]).toContain("█████╗");
    expect(out.endsWith("╝\n\n")).toBe(true);
  });

  it("narrow terminal gets the compact line", async () => {
    env({ ATLAS_UNICODE: "1" });
    vi.resetModules();
    const { printLogo } = await import("../src/ui/intro.js");
    const out = strip(await capture(printLogo, { isTTY: true, columns: 30 }));
    expect(out).toBe("\r\n  ◆ A T L A S\n\n");
  });
});

async function capture(fn: () => Promise<void>, props: { isTTY: boolean; columns: number }): Promise<string> {
  const out: string[] = [];
  const stdout = process.stdout as unknown as { isTTY: boolean; columns: number; write: (s: string) => boolean };
  const prev = { isTTY: stdout.isTTY, columns: stdout.columns, write: stdout.write };
  Object.assign(stdout, props, { write: (s: string) => (out.push(s), true) });
  try {
    await fn();
  } finally {
    Object.assign(stdout, prev);
  }
  return out.join("");
}
