import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { loadConfig } from "@the-atlas/core";
import type { Command } from "commander";
import { detectLang } from "../i18n.js";
import { readHidden } from "../prompt.js";
import { a } from "../ui/ansi.js";
import { I } from "../ui/theme.js";
import {
  addMcpServer,
  addMissingMcpServers,
  findPreset,
  importFromClaude,
  isRemote,
  isValidServerName,
  loadMcpConfig,
  maskSecrets,
  PRESETS,
  presetServer,
  removeMcpServer,
  setMcpDisabled,
  type McpServerConfig,
} from "./config.js";
import { mcpT, type McpDict } from "./i18n.js";
import { McpManager, mcpToolName, printable, type McpServerStatus } from "./manager.js";

export { maskSecrets };

const lang = () => {
  try {
    return detectLang(loadConfig());
  } catch {
    return "uz" as const;
  }
};

/** y/N question on the TTY; non-TTY answers "no". */
export async function confirm(question: string, L: McpDict): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`${question} ${a.dim(L.yesNo)} `)).trim().toLowerCase();
    return ["y", "yes", "ha", "h", "да", "д"].includes(ans);
  } finally {
    rl.close();
  }
}

/** Parses ["KEY=VALUE", …] into a map; returns the bad item on error. */
export function parsePairs(items: string[] | undefined, sep = "="): { map: Record<string, string>; bad?: string } {
  const map: Record<string, string> = {};
  for (const it of items ?? []) {
    const i = it.indexOf(sep);
    const k = i > 0 ? it.slice(0, i).trim() : "";
    if (!k) return { map, bad: it };
    map[k] = it.slice(i + sep.length).trim();
  }
  return { map };
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Parses ["Name: value" | "Name=value", …]; the first ":" or "=" splits, so "=" inside values is kept. */
export function parseHeaders(items: string[] | undefined): { map: Record<string, string>; bad?: string } {
  const map: Record<string, string> = {};
  for (const it of items ?? []) {
    const idx = [it.indexOf(":"), it.indexOf("=")].filter((i) => i > 0);
    const i = idx.length ? Math.min(...idx) : -1;
    const k = i > 0 ? it.slice(0, i).trim() : "";
    if (!k || !HEADER_NAME.test(k)) return { map, bad: it };
    map[k] = it.slice(i + 1).trim();
  }
  return { map };
}

/** One-line description of a server, with secrets masked (env/header values are never shown). */
export function describeServer(s: McpServerConfig): string {
  if (isRemote(s)) return maskSecrets(s.url) + (s.headers ? ` ${a.faint(`[${Object.keys(s.headers).join(", ")}]`)}` : "");
  const env = s.env ? ` ${a.faint(`[${Object.keys(s.env).join(", ")}]`)}` : "";
  return maskSecrets(`${s.command} ${(s.args ?? []).join(" ")}`.trim()) + env;
}

function stateCell(st: McpServerStatus, L: McpDict): { raw: string; color: (s: string) => string } {
  if (st.state === "connected") return { raw: `${I.on} ${L.connected}`, color: a.ok };
  if (st.state === "disabled") return { raw: `${I.off} ${L.disabled}`, color: a.faint };
  if (st.state === "connecting") return { raw: `${I.off} ${L.connecting}`, color: a.dim };
  return { raw: `${I.fail} ${L.failed}`, color: a.err };
}

/** Aligned status table (plain console output). */
export function renderTable(status: McpServerStatus[], servers: Record<string, McpServerConfig>, L: McpDict): string {
  const rows = status.map((st) => ({ st, cell: stateCell(st, L), target: servers[st.name] ? describeServer(servers[st.name]!) : "" }));
  const wName = Math.max(L.colName.length, ...rows.map((r) => r.st.name.length));
  const wState = Math.max(L.colState.length, ...rows.map((r) => r.cell.raw.length));
  const wTools = Math.max(L.colTools.length, 5);
  const lines = [a.dim(`  ${L.colName.padEnd(wName)}  ${L.colState.padEnd(wState)}  ${L.colTools.padStart(wTools)}  ${L.colTarget}`)];
  for (const r of rows) {
    const tools = r.st.state === "connected" ? String(r.st.tools) : "-";
    lines.push(`  ${a.text(r.st.name.padEnd(wName))}  ${r.cell.color(r.cell.raw.padEnd(wState))}  ${a.neon(tools.padStart(wTools))}  ${a.faint(r.target)}`);
    if (r.st.state === "failed" && r.st.error) lines.push(`  ${" ".repeat(wName)}  ${a.err(`${I.sub} ${r.st.error}`)}`);
  }
  return lines.join("\n");
}

function presetList(L: McpDict): string {
  return PRESETS.map((p) => `  ${a.neon(p.key.padEnd(20))} ${a.dim(L.presetHint[p.key] ?? p.label)}`).join("\n");
}

const die = (msg: string): never => {
  console.error(`${a.err(I.fail)} ${msg}`);
  process.exit(1);
};

/** Registers `atlas mcp …` sub-commands. */
export function registerMcp(program: Command): void {
  const mcp = program.command("mcp").description("manage MCP servers (external tools for agent mode)");

  mcp
    .command("list", { isDefault: true })
    .description("show MCP servers, their status and tool count")
    .action(async () => {
      const L = mcpT(lang());
      const cfg = loadMcpConfig();
      if (!Object.keys(cfg.mcpServers).length) {
        console.log(a.dim(L.none));
        console.log(`\n${a.bold(L.presets)}\n${presetList(L)}`);
        return;
      }
      if (process.stdout.isTTY) process.stdout.write(a.dim(`  ${L.connecting}\r`));
      const mgr = new McpManager({ config: cfg, cwd: process.cwd() });
      const status = await mgr.connectAll();
      await mgr.closeAll();
      if (process.stdout.isTTY) process.stdout.write("\r\u001b[2K");
      console.log(`${a.bold(L.title)}\n${renderTable(status, cfg.mcpServers, L)}`);
    });

  mcp
    .command("add <name> [command...]")
    .description("add a server: a preset name, --url <url>, or -- <command> [args...]")
    .option("--url <url>", "remote server URL (Streamable HTTP / SSE)")
    .option("-e, --env <pairs...>", "environment variables KEY=VALUE for a local server")
    .option("-H, --header <pairs...>", "HTTP headers KEY=VALUE for a remote server")
    .option("--cwd <dir>", "working directory for a local server")
    .action(async (name: string, command: string[], opts: { url?: string; env?: string[]; header?: string[]; cwd?: string }) => {
      const L = mcpT(lang());
      if (!isValidServerName(name)) die(L.badName);
      let server: McpServerConfig;
      const preset = findPreset(name);
      if (!opts.url && !command.length) {
        if (!preset) die(`${L.needTarget}\n${presetList(L)}`);
        let value: string | undefined;
        if (preset!.input) {
          const inp = preset!.input;
          if (inp.url) console.log(a.dim(inp.url));
          const q = `${L.ask[inp.ask]}${inp.secret ? ` ${a.faint(L.hidden)}` : ""}: `;
          value = inp.secret ? await readHidden(q) : await ask(q);
          if (!value) die(L.cancelled);
          if (inp.arg) value = resolve(value!);
        }
        server = presetServer(preset!, { cwd: process.cwd(), value });
        if (preset!.setup) console.log(`${a.warn(I.warn)} ${L.setupFirst} ${a.neon(preset!.setup)}`);
      } else if (opts.url) {
        const h = parseHeaders(opts.header);
        if (h.bad) die(`${L.badEnv} ${h.bad}`);
        server = Object.keys(h.map).length ? { url: opts.url, headers: h.map } : { url: opts.url };
      } else {
        const e = parsePairs(opts.env);
        if (e.bad) die(`${L.badEnv} ${e.bad}`);
        const [cmd, ...args] = command;
        server = { command: cmd!, ...(args.length ? { args } : {}), ...(Object.keys(e.map).length ? { env: e.map } : {}), ...(opts.cwd ? { cwd: resolve(opts.cwd) } : {}) };
      }
      try {
        addMcpServer(name, server);
      } catch (err) {
        die((err as Error).message);
      }
      console.log(`${a.ok(I.ok)} ${L.added} ${a.bold(name)} ${a.faint(describeServer(server))}`);
    });

  mcp
    .command("remove <name>")
    .alias("rm")
    .description("remove an MCP server")
    .action((name: string) => {
      const L = mcpT(lang());
      if (!removeMcpServer(name)) die(`${L.notFound} ${name}`);
      console.log(`${a.ok(I.ok)} ${L.removed} ${a.bold(name)}`);
    });

  for (const [cmd, off] of [["enable", false], ["disable", true]] as const) {
    mcp
      .command(`${cmd} <name>`)
      .description(`${cmd} an MCP server without removing it`)
      .action((name: string) => {
        const L = mcpT(lang());
        if (!setMcpDisabled(name, off)) die(`${L.notFound} ${name}`);
        console.log(`${a.ok(I.ok)} ${off ? L.disabledNow : L.enabled} ${a.bold(name)}`);
      });
  }

  mcp
    .command("tools <name>")
    .description("connect to a server and list its tools")
    .action(async (name: string) => {
      const L = mcpT(lang());
      const cfg = loadMcpConfig();
      const server = Object.hasOwn(cfg.mcpServers, name) ? cfg.mcpServers[name] : undefined;
      if (!server) die(`${L.notFound} ${name}`);
      const mgr = new McpManager({ config: { mcpServers: { [name]: { ...server!, disabled: false } } }, cwd: process.cwd() });
      const st = await mgr.connect(name);
      const tools = mgr.serverTools(name);
      await mgr.closeAll();
      if (st.state !== "connected") die(`${name}: ${st.error ?? L.failed}\n${maskSecrets(printable(mgr.stderr(name).trim().split("\n").slice(-5).join("\n"), true))}`);
      if (!tools.length) return console.log(a.dim(L.noTools));
      console.log(`${a.bold(`${L.toolsOf} ${name}`)} ${a.dim(`(${tools.length})`)}`);
      const w = Math.max(...tools.map((t) => mcpToolName(name, t.name).length));
      for (const t of tools) {
        const ro = t.annotations?.readOnlyHint === true;
        const risk = ro ? a.ok(L.readOnly.padEnd(7)) : a.warn(L.writes.padEnd(7));
        const desc = (t.description ?? "").split("\n")[0]!.slice(0, 90);
        console.log(`  ${risk} ${a.text(mcpToolName(name, t.name).padEnd(w))}  ${a.dim(desc)}`);
      }
    });

  mcp
    .command("import <source>")
    .description("import servers from another app (claude = Claude Desktop)")
    .action(async (source: string) => {
      const L = mcpT(lang());
      if (source !== "claude") die(L.importOnly);
      const found = importFromClaude();
      const names = Object.keys(found.servers);
      console.log(`${a.dim(L.importFrom)} ${a.faint(found.path)}`);
      for (const e of found.errors) console.log(`  ${a.warn(I.warn)} ${L.importBad} ${e}`);
      if (!names.length) return console.log(a.dim(L.importNone));
      const cfg = loadMcpConfig();
      for (const n of names) {
        const exists = Object.hasOwn(cfg.mcpServers, n);
        console.log(`  ${exists ? a.faint(I.off) : a.neon(I.on)} ${a.text(n.padEnd(20))} ${a.faint(describeServer(found.servers[n]!))}${exists ? a.dim(`  ${L.importSkip}`) : ""}`);
      }
      const fresh = names.filter((n) => !Object.hasOwn(cfg.mcpServers, n));
      if (!fresh.length) return;
      if (!(await confirm(L.importAsk, L))) return console.log(a.dim(L.cancelled));
      const added = addMissingMcpServers(Object.fromEntries(fresh.map((n) => [n, found.servers[n]!])));
      console.log(`${a.ok(I.ok)} ${L.importDone}: ${added.join(", ")}`);
    });
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}
