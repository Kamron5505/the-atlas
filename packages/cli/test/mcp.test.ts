import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addMcpServer,
  addMissingMcpServers,
  claudeDesktopConfigPath,
  findPreset,
  importFromClaude,
  isValidServerName,
  loadMcpConfig,
  mcpConfigPath,
  normalizeServerName,
  presetServer,
  removeMcpServer,
  setMcpDisabled,
  validateServer,
} from "../src/mcp/config.js";
import { capOutput, flattenContent, McpManager, mcpToolName, printable } from "../src/mcp/manager.js";
import { describeServer, maskSecrets, parseHeaders, parsePairs, renderTable } from "../src/mcp/command.js";
import { mcpT } from "../src/mcp/i18n.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "echo-mcp.mjs");
const node = (mode = "ok", env?: Record<string, string>) => ({ command: process.execPath, args: [FIXTURE, mode], ...(env ? { env } : {}) });
const ctx = { cwd: process.cwd() };

let home = "";
const prevHome = process.env.ATLAS_HOME;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "atlas-mcp-"));
  process.env.ATLAS_HOME = home;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.ATLAS_HOME;
  else process.env.ATLAS_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("mcp config", () => {
  it("validates names and entries", () => {
    expect(isValidServerName("git-hub_2")).toBe(true);
    expect(isValidServerName("GitHub")).toBe(false);
    expect(isValidServerName("a b")).toBe(false);
    expect(isValidServerName("")).toBe(false);
    expect(normalizeServerName("My GitHub Server!")).toBe("my-github-server");
    expect(validateServer({ command: "npx", args: ["-y", "x"] })).toBeNull();
    expect(validateServer({ url: "https://x.dev/mcp", headers: { A: "b" } })).toBeNull();
    expect(validateServer({ url: "ftp://x" })).toMatch(/http/);
    expect(validateServer({ args: [] })).toMatch(/command/);
    expect(validateServer({ command: "x", env: { A: 1 } })).toMatch(/env/);
  });

  it("adds, disables and removes servers in atlasHome()/mcp.json", () => {
    expect(mcpConfigPath()).toBe(join(home, "mcp.json"));
    expect(loadMcpConfig().mcpServers).toEqual({});
    addMcpServer("echo", { command: "node", args: ["e.mjs"], env: { K: "v" } });
    addMcpServer("remote", { url: "https://example.com/mcp" });
    expect(() => addMcpServer("Bad Name", { command: "x" })).toThrow(/Invalid/);
    expect(() => addMcpServer("bad", { command: "" })).toThrow(/command/);
    const raw = JSON.parse(readFileSync(join(home, "mcp.json"), "utf8"));
    expect(raw.mcpServers.echo).toEqual({ command: "node", args: ["e.mjs"], env: { K: "v" } });
    if (process.platform !== "win32") expect(statSync(join(home, "mcp.json")).mode & 0o777).toBe(0o600);
    expect(setMcpDisabled("remote", true)).toBe(true);
    expect(loadMcpConfig().mcpServers.remote?.disabled).toBe(true);
    expect(setMcpDisabled("nope", true)).toBe(false);
    expect(removeMcpServer("echo")).toBe(true);
    expect(removeMcpServer("echo")).toBe(false);
    expect(Object.keys(loadMcpConfig().mcpServers)).toEqual(["remote"]);
  });

  it("keeps entries it cannot parse and other keys when editing", () => {
    const file = join(home, "mcp.json");
    writeFileSync(file, JSON.stringify({ note: "keep", mcpServers: { weird: { command: "x", env: { PORT: 3000 } }, ok: { command: "y", timeout: 5 } } }));
    expect(Object.keys(loadMcpConfig().mcpServers)).toEqual(["ok"]);
    addMcpServer("new", { command: "z" });
    expect(setMcpDisabled("weird", true)).toBe(true);
    expect(removeMcpServer("ok")).toBe(true);
    const raw = JSON.parse(readFileSync(file, "utf8"));
    expect(raw.note).toBe("keep");
    expect(raw.mcpServers.weird).toEqual({ command: "x", env: { PORT: 3000 }, disabled: true });
    expect(Object.keys(raw.mcpServers)).toEqual(["weird", "new"]);
    expect(addMissingMcpServers({ new: { command: "other" }, fresh: { url: "https://f.dev/mcp" } })).toEqual(["fresh"]);
    expect(loadMcpConfig().mcpServers.new).toEqual({ command: "z" });
    expect(isValidServerName("__proto__")).toBe(false);
  });

  it("treats Object.prototype names (constructor) as ordinary server names", () => {
    expect(addMissingMcpServers({ constructor: { command: "c" } })).toEqual(["constructor"]);
    expect(loadMcpConfig().mcpServers.constructor).toEqual({ command: "c" });
    const src = join(home, "claude.json");
    writeFileSync(src, JSON.stringify({ mcpServers: { Constructor: { command: "x" } } }));
    expect(Object.keys(importFromClaude(src).servers)).toEqual(["constructor"]);
  });

  it("writes atomically without leaving temp files", () => {
    addMcpServer("a", { command: "x" });
    writeFileSync(join(home, `mcp.json.${process.pid}.tmp`), "stale");
    addMcpServer("b", { command: "y" });
    expect(readdirSync(home)).toEqual(["mcp.json"]);
    expect(Object.keys(loadMcpConfig().mcpServers)).toEqual(["a", "b"]);
  });

  it("throws on corrupted config", () => {
    writeFileSync(join(home, "mcp.json"), "{nope");
    expect(() => loadMcpConfig()).toThrow(/corrupted/);
  });

  it("imports Claude Desktop config read-only", () => {
    const src = join(home, "claude", "claude_desktop_config.json");
    mkdirSync(dirname(src), { recursive: true });
    const body = JSON.stringify({
      globalShortcut: "x",
      mcpServers: {
        "My FS": { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
        remote: { url: "https://mcp.example.com/sse", headers: { Authorization: "Bearer t" } },
        broken: { args: ["no command"] },
      },
    });
    writeFileSync(src, body);
    const r = importFromClaude(src);
    expect(Object.keys(r.servers)).toEqual(["my-fs", "remote"]);
    expect(r.errors).toEqual(["broken: command or url is required"]);
    expect(readFileSync(src, "utf8")).toBe(body);
    expect(importFromClaude(join(home, "missing.json")).servers).toEqual({});
  });

  it("knows Claude Desktop paths per OS", () => {
    expect(claudeDesktopConfigPath("win32", { APPDATA: "C:\\AppData" })).toContain(join("Claude", "claude_desktop_config.json"));
    expect(claudeDesktopConfigPath("win32", { APPDATA: "C:\\AppData" }).startsWith("C:\\AppData")).toBe(true);
    expect(claudeDesktopConfigPath("darwin", {})).toContain(join("Library", "Application Support", "Claude"));
    expect(claudeDesktopConfigPath("linux", { XDG_CONFIG_HOME: "/x" })).toBe(join("/x", "Claude", "claude_desktop_config.json"));
  });

  it("builds preset entries", () => {
    expect(presetServer(findPreset("filesystem")!, { cwd: "/proj" })).toEqual({ command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/proj"] });
    expect(presetServer(findPreset("github")!, { cwd: "/p", value: "ghp_x" })).toEqual({
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer ghp_x" },
    });
    expect(presetServer(findPreset("postgres")!, { cwd: "/p", value: "postgresql://u@h/db" })).toMatchObject({ env: { POSTGRES_CONNECTION_STRING: "postgresql://u@h/db" } });
    expect(presetServer(findPreset("sqlite")!, { cwd: "/p", value: "/d.db" })).toEqual({ command: "npx", args: ["-y", "mcp-server-sqlite-npx", "/d.db"] });
    // "$&" / "$'" in a token or path must not be expanded by String.replace.
    expect(presetServer(findPreset("github")!, { cwd: "/p", value: "a$&b$'c" })).toMatchObject({ headers: { Authorization: "Bearer a$&b$'c" } });
    expect(presetServer(findPreset("filesystem")!, { cwd: "C:\\$&dir" })).toMatchObject({ args: ["-y", "@modelcontextprotocol/server-filesystem", "C:\\$&dir"] });
  });

  it("parses KEY=VALUE pairs", () => {
    expect(parsePairs(["A=1", "B=x=y"])).toEqual({ map: { A: "1", B: "x=y" } });
    expect(parsePairs(["=1"]).bad).toBe("=1");
    expect(parseHeaders(["Authorization: Basic dXNlcjpwYXNzMQ==", "X-Key=a=b"]).map).toEqual({ Authorization: "Basic dXNlcjpwYXNzMQ==", "X-Key": "a=b" });
    expect(parseHeaders(["Bad Name: x"]).bad).toBe("Bad Name: x");
  });

  it("masks secrets when describing servers", () => {
    const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");
    const tok = "0df64dd16a843f48e5b56d695a7114ab73e1438968e50d8c1247da2cac1f8f7a";
    const d = strip(describeServer({ command: "npx", args: ["mcp-remote@latest", "https://h/mcp/", "--header", `Authorization: Bearer ${tok}`], env: { SECRET: "s3cr3t" } }));
    expect(d).not.toContain(tok);
    expect(d).not.toContain("s3cr3t");
    expect(d).toContain("mcp-remote@latest");
    expect(maskSecrets("--token ghp_abc123 x")).toBe("--token **** x");
    expect(maskSecrets("https://u:pw@h/x?api_key=k1")).toBe("https://u:****@h/x?api_key=****");
    expect(maskSecrets("npx -y @modelcontextprotocol/server-filesystem C:\\proj")).toBe("npx -y @modelcontextprotocol/server-filesystem C:\\proj");
    expect(strip(describeServer({ url: "https://x/mcp", headers: { Authorization: "Bearer zzz" } }))).toBe("https://x/mcp [Authorization]");
  });
});

describe("mcp helpers", () => {
  it("names tools mcp__server__tool within 64 chars", () => {
    expect(mcpToolName("echo", "write_note")).toBe("mcp__echo__write_note");
    expect(mcpToolName("my.srv", "a b/c")).toMatch(/^mcp__my_srv__a_b_c_+_[0-9a-f]{12}$/);
    const long = mcpToolName("server", "x".repeat(100));
    expect(long.length).toBe(64);
    expect(long).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(long).not.toBe(mcpToolName("server", `${"x".repeat(99)}y`));
  });

  it("gives every (server, tool) its own stable name, independent of other servers", () => {
    // Previously these pairs got the same base name and tools() renamed by connection order,
    // so an "always" approval for one tool could later apply to the other.
    const pairs: [string, string][] = [
      ["a", "b__c"],
      ["a__b", "c"],
      ["x.y", "t"],
      ["x_y", "t"],
      ["x_", "_t"],
      ["x", "__t"],
    ];
    const names = pairs.map(([s, t]) => mcpToolName(s, t));
    expect(new Set(names).size).toBe(pairs.length);
    expect(names.every((n) => /^[a-zA-Z0-9_-]{1,64}$/.test(n))).toBe(true);
    expect(mcpToolName("x_y", "t")).toBe("mcp__x_y__t");
    expect(mcpToolName("a", "b__c")).toBe("mcp__a__b__c");
    // A plain tool name crafted to look like a hashed one stays plain (≤ 55) and cannot collide.
    const hashed = mcpToolName("s", "y".repeat(60));
    expect(mcpToolName("s", hashed.slice("mcp__s__".length))).not.toBe(hashed);
  });

  it("strips control characters from server text", () => {
    expect(printable("a\u001b[2Jb\u0007c\td")).toBe("a[2Jbc d");
    expect(printable("l1\nl2\u001b", true)).toBe("l1\nl2");
  });

  it("flattens content parts", () => {
    const out = flattenContent({
      content: [
        { type: "text", text: "hi" },
        { type: "image", mimeType: "image/png", data: Buffer.alloc(12 * 1024).toString("base64") },
        { type: "resource", resource: { uri: "file:///a.txt", text: "body" } },
        { type: "resource", resource: { uri: "file:///b.bin", mimeType: "application/octet-stream", blob: "AAAA" } },
        { type: "resource_link", uri: "file:///c", name: "c" },
      ],
    });
    expect(out).toBe("hi\n[image image/png 12 KB]\n[resource file:///a.txt]\nbody\n[resource file:///b.bin application/octet-stream 3 B]\n[resource_link file:///c c]");
    expect(flattenContent({ content: [], structuredContent: { a: 1 } })).toBe('{"a":1}');
    expect(capOutput("abcdef", 3)).toBe("abc\n… [truncated 3 chars]");
  });
});

describe("McpManager (real stdio fixture)", () => {
  let mgr: McpManager;
  beforeAll(async () => {
    mgr = new McpManager({
      config: {
        mcpServers: {
          echo: node("ok", { ECHO_ENV: "from-config" }),
          crash: node("crash"),
          missing: { command: "atlas-no-such-binary-xyz" },
          off: { ...node("ok"), disabled: true },
        },
      },
      connectTimeoutMs: 8000,
      callTimeoutMs: 1500,
    });
    await mgr.connectAll();
  }, 30_000);
  afterAll(async () => {
    await mgr?.closeAll();
  });

  it("connects good servers while broken ones fail independently", () => {
    const st = Object.fromEntries(mgr.status().map((s) => [s.name, s]));
    expect(st.echo).toMatchObject({ state: "connected", tools: 8, transport: "stdio" });
    expect(st.crash?.state).toBe("failed");
    expect(st.crash?.error).toBeTruthy();
    expect(mgr.stderr("crash")).toContain("crashed on purpose");
    expect(st.missing?.state).toBe("failed");
    expect(st.off).toMatchObject({ state: "disabled", tools: 0 });
  });

  it("lists prefixed tools with risk mapping and schema", () => {
    const tools = mgr.tools();
    expect(tools.every((t) => t.name.startsWith("mcp__echo__") && t.source === "echo")).toBe(true);
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    // readOnlyHint is server-supplied and untrusted: it must not skip approval.
    expect(mgr.serverTools("echo").find((t) => t.name === "echo")?.annotations?.readOnlyHint).toBe(true);
    expect(by.mcp__echo__echo?.risk).toBe("write");
    expect(tools.every((t) => t.risk === "write")).toBe(true);
    expect(by.mcp__echo__echo?.parameters).toMatchObject({ type: "object", properties: { text: { type: "string" } } });
    expect(mgr.serverTools("echo").map((t) => t.name)).toContain("boom");
  });

  it("calls tools and passes env", async () => {
    const by = Object.fromEntries(mgr.tools().map((t) => [t.name, t]));
    expect(await by.mcp__echo__echo!.run({ text: "salom" }, ctx)).toMatchObject({ output: "salom", isError: false });
    expect((await by.mcp__echo__env!.run({}, ctx)).output).toBe("from-config");
    expect((await by.mcp__echo__image!.run({}, ctx)).output).toBe("here\n[image image/png 12 KB]");
    const big = await by.mcp__echo__big!.run({}, ctx);
    expect(big.output.length).toBeLessThan(20_100);
    expect(big.output).toContain("truncated");
  });

  it("passes errors through", async () => {
    const by = Object.fromEntries(mgr.tools().map((t) => [t.name, t]));
    expect(await by.mcp__echo__fail_soft!.run({}, ctx)).toMatchObject({ output: "soft failure", isError: true });
    const boom = await by.mcp__echo__boom!.run({}, ctx);
    expect(boom.isError).toBe(true);
    expect(boom.output).toContain("boom exploded");
  });

  it("times out slow calls without breaking the server", async () => {
    const by = Object.fromEntries(mgr.tools().map((t) => [t.name, t]));
    const slow = await by.mcp__echo__slow!.run({ ms: 5000 }, ctx);
    expect(slow.isError).toBe(true);
    expect(slow.output).toMatch(/timed out|timeout/i);
    expect((await by.mcp__echo__echo!.run({ text: "still here" }, ctx)).output).toBe("still here");
  }, 10_000);

  it("renders an aligned status table", () => {
    const L = mcpT("en");
    const out = renderTable(mgr.status(), {}, L).replace(/\u001b\[[0-9;]*m/g, "");
    expect(out).toContain("echo");
    expect(out).toMatch(/connected\s+8/);
    expect(out).toContain("error");
  });
});

describe("McpManager timeouts", () => {
  it("fails a hanging server after the connect timeout and kills it", async () => {
    const mgr = new McpManager({ config: { mcpServers: { hang: node("hang"), echo: node("ok") } }, connectTimeoutMs: 1500 });
    const t0 = Date.now();
    const st = await mgr.connectAll();
    expect(Date.now() - t0).toBeLessThan(6000);
    expect(st.find((s) => s.name === "hang")).toMatchObject({ state: "failed" });
    expect(st.find((s) => s.name === "hang")?.error).toMatch(/timed out|timeout/i);
    expect(st.find((s) => s.name === "echo")?.state).toBe("connected");
    await mgr.closeAll();
    expect(mgr.tools()).toEqual([]);
    expect(mgr.status().every((s) => s.state === "failed")).toBe(true);
  }, 15_000);

  it("masks secrets and strips escapes from server stderr in the status error", async () => {
    const mgr = new McpManager({ config: { mcpServers: { leak: node("leak") } }, connectTimeoutMs: 8000 });
    const [st] = await mgr.connectAll();
    expect(st?.state).toBe("failed");
    expect(st?.error).toContain("Bearer ****");
    expect(st?.error).not.toContain("ghp_leakedtoken123");
    expect(st?.error).not.toMatch(/[\u0000-\u001f]/);
    await mgr.closeAll();
  }, 15_000);

  it("closeAll after the child was spawned aborts the handshake promptly", async () => {
    const mgr = new McpManager({ config: { mcpServers: { hang: node("hang") } }, connectTimeoutMs: 10_000 });
    const pending = mgr.connectAll();
    await new Promise((r) => setTimeout(r, 300));
    expect(mgr.status()[0]?.state).toBe("connecting");
    const t0 = Date.now();
    await mgr.closeAll();
    const [st] = await pending;
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(st?.state).toBe("failed");
    expect(mgr.tools()).toEqual([]);
  }, 15_000);

  it("closeAll during connect does not leave servers running", async () => {
    const mgr = new McpManager({ config: { mcpServers: { echo: node("ok") } }, connectTimeoutMs: 8000 });
    const pending = mgr.connectAll();
    await mgr.closeAll();
    const [st] = await pending;
    expect(st?.state).toBe("failed");
    expect(mgr.tools()).toEqual([]);
    await mgr.closeAll();
  }, 15_000);

  it("keeps tool names unique when sanitized names clash", async () => {
    const mgr = new McpManager({ config: { mcpServers: { e_1: node("ok"), "e.1": node("ok") } }, connectTimeoutMs: 8000 });
    await mgr.connectAll();
    const names = mgr.tools().map((t) => t.name);
    expect(names).toHaveLength(16);
    expect(new Set(names).size).toBe(16);
    expect(names.every((n) => /^[a-zA-Z0-9_-]{1,64}$/.test(n))).toBe(true);
    expect(names).toContain("mcp__e_1__echo");
    expect(mgr.tools().map((t) => t.name)).toEqual(names);
    await mgr.closeAll();
  }, 15_000);

  it("falls back to SSE and reports failure for unreachable remote servers", async () => {
    const mgr = new McpManager({ config: { mcpServers: { r: { url: "http://127.0.0.1:9/mcp" } } }, connectTimeoutMs: 3000 });
    const [st] = await mgr.connectAll();
    expect(st).toMatchObject({ name: "r", state: "failed" });
    await mgr.closeAll();
  }, 15_000);
});
