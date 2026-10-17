import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { atlasHome } from "@the-atlas/core";

/** Local process server (Claude Desktop format). */
export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
}

/** Remote server: Streamable HTTP, with SSE fallback. */
export interface RemoteServerConfig {
  url: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

export type McpServerConfig = StdioServerConfig | RemoteServerConfig;

/** Contents of atlasHome()/mcp.json. */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

const NAME_RE = /^[a-z0-9_-]{1,32}$/;

export const isRemote = (s: McpServerConfig): s is RemoteServerConfig => "url" in s && typeof s.url === "string";

/** Server names: lowercase [a-z0-9_-], 1..32 chars. */
export function isValidServerName(name: string): boolean {
  return NAME_RE.test(name) && name !== "__proto__";
}

/** Turns an arbitrary name ("GitHub Server") into a valid one ("github-server"). */
export function normalizeServerName(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return n || "server";
}

const strMap = (x: unknown): x is Record<string, string> =>
  !!x && typeof x === "object" && !Array.isArray(x) && Object.values(x).every((v) => typeof v === "string");

/** Returns an error message, or null when the server entry is well-formed. */
export function validateServer(s: unknown): string | null {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "entry must be an object";
  const o = s as Record<string, unknown>;
  if (o.disabled !== undefined && typeof o.disabled !== "boolean") return "disabled must be boolean";
  if ("url" in o) {
    if (typeof o.url !== "string") return "url must be a string";
    try {
      const u = new URL(o.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return "url must be http(s)";
    } catch {
      return "url is invalid";
    }
    if (o.headers !== undefined && !strMap(o.headers)) return "headers must be string map";
    return null;
  }
  if (typeof o.command !== "string" || !o.command.trim()) return "command or url is required";
  if (o.args !== undefined && (!Array.isArray(o.args) || !o.args.every((a) => typeof a === "string"))) return "args must be string[]";
  if (o.env !== undefined && !strMap(o.env)) return "env must be string map";
  if (o.cwd !== undefined && typeof o.cwd !== "string") return "cwd must be a string";
  return null;
}

/** Keeps only known fields of a valid entry. */
function clean(s: McpServerConfig): McpServerConfig {
  const out: Record<string, unknown> = {};
  if (isRemote(s)) {
    out.url = s.url;
    if (s.headers && Object.keys(s.headers).length) out.headers = { ...s.headers };
  } else {
    out.command = s.command;
    if (s.args?.length) out.args = [...s.args];
    if (s.env && Object.keys(s.env).length) out.env = { ...s.env };
    if (s.cwd) out.cwd = s.cwd;
  }
  if (s.disabled) out.disabled = true;
  return out as unknown as McpServerConfig;
}

/** Parses a Claude-Desktop-style object; invalid entries are skipped and reported. */
export function parseServers(raw: unknown): { servers: Record<string, McpServerConfig>; errors: string[] } {
  const servers: Record<string, McpServerConfig> = {};
  const errors: string[] = [];
  const map = raw && typeof raw === "object" ? (raw as { mcpServers?: unknown }).mcpServers : undefined;
  if (!map || typeof map !== "object" || Array.isArray(map)) return { servers, errors };
  for (const [name, entry] of Object.entries(map)) {
    if (name === "__proto__") continue;
    const err = validateServer(entry);
    if (err) errors.push(`${name}: ${err}`);
    else servers[name] = clean(entry as McpServerConfig);
  }
  return { servers, errors };
}

export function mcpConfigPath(): string {
  return join(atlasHome(), "mcp.json");
}

/** Reads mcp.json; missing file means no servers. Throws on corrupted JSON. */
export function loadMcpConfig(path = mcpConfigPath()): McpConfig {
  if (!existsSync(path)) return { mcpServers: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`MCP config is corrupted: ${path}`);
  }
  return { mcpServers: parseServers(raw).servers };
}

/** Atomic write (tmp + rename), mode 0600 — the file may hold tokens. */
export function saveMcpConfig(cfg: McpConfig, path = mcpConfigPath()): void {
  writeJson(cfg, path);
}

function writeJson(data: unknown, path: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    rmSync(tmp, { force: true });
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows: permissions are inherited from the user profile.
  }
}

type RawConfig = Record<string, unknown> & { mcpServers: Record<string, unknown> };

/**
 * Reads mcp.json as-is so edits keep entries Atlas skips (invalid or unknown
 * fields) and other top-level keys. Throws on corrupted JSON.
 */
function loadRaw(path: string): RawConfig {
  let raw: unknown = {};
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new Error(`MCP config is corrupted: ${path}`);
    }
  }
  const obj = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const map = obj.mcpServers;
  obj.mcpServers = map && typeof map === "object" && !Array.isArray(map) ? map : {};
  return obj as RawConfig;
}

/** Adds or replaces a server. Throws on invalid name/entry. */
export function addMcpServer(name: string, server: McpServerConfig, path = mcpConfigPath()): McpConfig {
  if (!isValidServerName(name)) throw new Error(`Invalid server name "${name}" (use a-z 0-9 _ -)`);
  const err = validateServer(server);
  if (err) throw new Error(`${name}: ${err}`);
  const raw = loadRaw(path);
  raw.mcpServers[name] = clean(server);
  writeJson(raw, path);
  return loadMcpConfig(path);
}

/** Adds servers whose names are not taken yet; returns the added names. */
export function addMissingMcpServers(servers: Record<string, McpServerConfig>, path = mcpConfigPath()): string[] {
  const raw = loadRaw(path);
  const added: string[] = [];
  for (const [name, s] of Object.entries(servers)) {
    if (Object.hasOwn(raw.mcpServers, name) || !isValidServerName(name) || validateServer(s)) continue;
    raw.mcpServers[name] = clean(s);
    added.push(name);
  }
  if (added.length) writeJson(raw, path);
  return added;
}

/** Removes a server; false when it did not exist. */
export function removeMcpServer(name: string, path = mcpConfigPath()): boolean {
  const raw = loadRaw(path);
  if (!Object.hasOwn(raw.mcpServers, name)) return false;
  delete raw.mcpServers[name];
  writeJson(raw, path);
  return true;
}

/** Sets or clears the "disabled" flag; false when the server does not exist. */
export function setMcpDisabled(name: string, disabled: boolean, path = mcpConfigPath()): boolean {
  const raw = loadRaw(path);
  const s = Object.hasOwn(raw.mcpServers, name) ? raw.mcpServers[name] : undefined;
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const o = s as Record<string, unknown>;
  if (disabled) o.disabled = true;
  else delete o.disabled;
  writeJson(raw, path);
  return true;
}

/** Location of Claude Desktop's config on this OS. */
export function claudeDesktopConfigPath(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === "win32") return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Claude", "claude_desktop_config.json");
}

/**
 * Reads servers from Claude Desktop's config (read-only, the source is never
 * modified). Names are normalized to Atlas rules.
 */
export function importFromClaude(path = claudeDesktopConfigPath()): { path: string; servers: Record<string, McpServerConfig>; errors: string[] } {
  if (!existsSync(path)) return { path, servers: {}, errors: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { path, servers: {}, errors: [`cannot parse ${path}`] };
  }
  const parsed = parseServers(raw);
  const servers: Record<string, McpServerConfig> = {};
  for (const [name, s] of Object.entries(parsed.servers)) {
    let n = normalizeServerName(name);
    for (let i = 2; Object.hasOwn(servers, n); i++) n = `${normalizeServerName(name).slice(0, 29)}-${i}`;
    servers[n] = s;
  }
  return { path, servers, errors: parsed.errors };
}

/** A secret or value the preset asks for when added. */
export interface PresetInput {
  /** Env var (stdio) or header (remote) that receives the value. */
  env?: string;
  header?: string;
  /** Header value template; "{}" is replaced by the input. */
  format?: string;
  /** Appended to args instead of env/header (e.g. a DB path). */
  arg?: boolean;
  secret: boolean;
  /** Key into McpDict.ask for the prompt. */
  ask: "githubToken" | "pgUrl" | "sqlitePath";
  /** Where to get it. */
  url?: string;
}

export interface McpPreset {
  key: string;
  /** npm package (verified to exist on npm on 2026-10-17), or remote URL. */
  pkg?: string;
  url?: string;
  /** Short English label; localized hint lives in McpDict.presets. */
  label: string;
  input?: PresetInput;
  /** Extra args after the package; "{cwd}" is the project dir. */
  args?: string[];
  /** Command to run once before first use (auth), shown to the user. */
  setup?: string;
}

/** Ready-made servers for `atlas mcp add <preset>`. */
export const PRESETS: McpPreset[] = [
  { key: "filesystem", pkg: "@modelcontextprotocol/server-filesystem", label: "Filesystem", args: ["{cwd}"] },
  {
    key: "github",
    url: "https://api.githubcopilot.com/mcp/",
    label: "GitHub",
    input: { header: "Authorization", format: "Bearer {}", secret: true, ask: "githubToken", url: "https://github.com/settings/personal-access-tokens" },
  },
  { key: "browser", pkg: "@playwright/mcp", label: "Browser (Playwright)" },
  { key: "memory", pkg: "@modelcontextprotocol/server-memory", label: "Memory" },
  { key: "sequential-thinking", pkg: "@modelcontextprotocol/server-sequential-thinking", label: "Sequential thinking" },
  { key: "sqlite", pkg: "mcp-server-sqlite-npx", label: "SQLite", input: { arg: true, secret: false, ask: "sqlitePath" } },
  {
    key: "postgres",
    pkg: "@henkey/postgres-mcp-server",
    label: "PostgreSQL",
    input: { env: "POSTGRES_CONNECTION_STRING", secret: true, ask: "pgUrl" },
  },
  { key: "gdrive", pkg: "@piotr-agier/google-drive-mcp", label: "Google Drive", setup: "npx -y @piotr-agier/google-drive-mcp auth" },
];

export const findPreset = (key: string): McpPreset | undefined => PRESETS.find((p) => p.key === key);

/** Builds the server entry for a preset. */
export function presetServer(p: McpPreset, opts: { cwd: string; value?: string }): McpServerConfig {
  const v = opts.value ?? "";
  if (p.url) {
    const headers: Record<string, string> = {};
    if (p.input?.header && v) headers[p.input.header] = (p.input.format ?? "{}").replace("{}", () => v);
    return Object.keys(headers).length ? { url: p.url, headers } : { url: p.url };
  }
  const args = ["-y", p.pkg!, ...(p.args ?? []).map((a) => a.replace("{cwd}", () => opts.cwd))];
  if (p.input?.arg && v) args.push(v);
  const env: Record<string, string> = {};
  if (p.input?.env && v) env[p.input.env] = v;
  return Object.keys(env).length ? { command: "npx", args, env } : { command: "npx", args };
}

/** Hides token-like values (Bearer …, ghp_…, long opaque strings) in displayed args/URLs/errors. */
export function maskSecrets(s: string): string {
  return s
    .replace(/\b(bearer|basic)(\s+)\S+/gi, "$1$2****")
    .replace(/(--?(?:token|api[-_]?key|password|secret)[=\s]+)\S+/gi, "$1****")
    .replace(/([?&](?:key|token|api_key|apikey|access_token|secret)=)[^&\s]+/gi, "$1****")
    .replace(/(:\/\/[^:/\s]+:)[^@\s]+@/g, "$1****@")
    .replace(/\b(?:gh[pousr]_|github_pat_|sk-|xox[abp]-)[A-Za-z0-9_-]+/g, "****")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "****");
}
