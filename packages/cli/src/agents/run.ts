import { loadConfig, saveConfig } from "@the-atlas/core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { findBinary, installFor, isRemoteScript, which, type Agent } from "./catalog.js";
import { openInNewWindow } from "./terminal.js";
import { loadState, recordUsage, saveState } from "./state.js";

import { a } from "../ui/ansi.js";
import { stripEmoji } from "../ui/theme.js";

const gray = a.dim;
const yellow = a.warn;
const green = a.ok;

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question(`${question} ${defaultYes ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
    return a === "" ? defaultYes : a === "y" || a === "yes" || a === "ha" || a === "да";
  } finally {
    rl.close();
  }
}

/** Git Bash on Windows; skips System32\bash.exe (WSL launcher). */
function findBash(): string | undefined {
  if (process.platform !== "win32") return "/bin/bash";
  const p = which("bash");
  if (p && !/system32/i.test(p)) return p;
  const git = "C:\\Program Files\\Git\\bin\\bash.exe";
  return existsSync(git) ? git : undefined;
}

function run(cmd: string, args: string[], opts: { shell?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: opts.shell ?? false, env: opts.env ?? process.env, windowsHide: false });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

export async function installAgent(agent: Agent, opts: { yes?: boolean } = {}): Promise<boolean> {
  const install = installFor(agent);
  if (!install) {
    console.log(yellow(`! ${agent.name}: no installer for this OS${process.platform === "win32" ? " (use WSL)" : ""} → ${agent.url}`));
    return false;
  }
  console.log(`${agent.name} is not installed.\n  ${gray("$")} ${install}`);
  if (isRemoteScript(install) || /\birm\b/.test(install)) console.log(yellow("  ! downloads and runs a remote install script"));
  if (agent.custom) console.log(yellow("  ! custom agent from your agents.conf — not verified by The Atlas"));
  if (!opts.yes && !(await confirm("Install now?"))) return false;

  let code: number;
  if (/^bash\s/.test(install)) {
    const bash = findBash();
    if (!bash) {
      console.log(yellow("! needs bash (Git for Windows: https://git-scm.com) or WSL"));
      return false;
    }
    code = await run(bash, ["-lc", install]);
  } else if (process.platform === "win32") {
    // PowerShell lines (irm … | iex, winget, npm, pip) all run fine in PowerShell.
    code = await run("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", install]);
  } else {
    code = await run(install, [], { shell: true });
  }
  if (code !== 0) {
    console.log(yellow(`✗ install failed (exit ${code}). Check internet / permissions, or run it manually.`));
    return false;
  }
  if (!findBinary(agent)) {
    console.log(yellow("! installed, but not found on PATH. Reopen the terminal, then: atlas doctor"));
    return false;
  }
  console.log(green(`✓ ${agent.name} installed`));
  return true;
}

/** Env/args that point known agents at the local Atlas proxy. */
export function atlasWiring(agent: Agent, baseURL: string, token: string): { env: Record<string, string>; args: string[] } {
  const env: Record<string, string> = {
    OPENAI_BASE_URL: baseURL,
    OPENAI_API_BASE: baseURL,
    OPENAI_API_KEY: token,
  };
  switch (agent.binary) {
    case "aider":
      return { env, args: ["--model", "openai/auto", "--no-show-model-warnings"] };
    case "interpreter":
      return { env, args: ["--api_base", baseURL, "--api_key", token, "--model", "openai/auto"] };
    case "sgpt":
      return { env: { ...env, API_BASE_URL: baseURL, DEFAULT_MODEL: "auto" }, args: [] };
    default:
      return { env, args: [] };
  }
}

/** Agents known to work through the Atlas proxy with zero config. */
export const ATLAS_READY = new Set(["aider", "interpreter", "sgpt"]);

export const ATLAS_PORT = 4141;

async function healthy(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) })).ok;
  } catch {
    return false;
  }
}

/**
 * Makes sure a background `atlas serve` is running, so agents in other windows
 * keep working after this process exits. Returns the endpoint and its token.
 */
export async function ensureAtlasServer(port = ATLAS_PORT): Promise<{ url: string; token: string }> {
  const cfg = loadConfig();
  if (!cfg.serveToken) {
    cfg.serveToken = `atlas-${randomBytes(18).toString("base64url")}`;
    saveConfig(cfg);
  }
  const url = `http://127.0.0.1:${port}/v1`;
  if (!(await healthy(port))) {
    const entry = process.argv[1];
    if (!entry) throw new Error("cannot locate atlas entry point");
    spawn(process.execPath, [entry, "serve", "--port", String(port)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let i = 0; i < 25 && !(await healthy(port)); i++) await new Promise((r) => setTimeout(r, 200));
    if (!(await healthy(port))) throw new Error(`Atlas server did not start on port ${port}`);
  }
  return { url, token: cfg.serveToken };
}

function quoteWin(a: string): string {
  return /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

export interface LaunchOptions {
  yes?: boolean;
  /** Route the agent through Atlas free models. */
  free?: boolean;
  /** Open in a new terminal window (installs there if missing). */
  window?: boolean;
}

/** Free-mode env/args for an agent (starts the background Atlas server). */
async function freeWiring(agent: Agent): Promise<{ env: Record<string, string>; args: string[] }> {
  const { url, token } = await ensureAtlasServer();
  return atlasWiring(agent, url, token);
}

/** Opens the agent in a new terminal window (installing it there if needed). */
export async function openAgentWindow(agent: Agent, opts: { free?: boolean; args?: string[] } = {}): Promise<boolean> {
  const wiring = opts.free ? await freeWiring(agent) : { env: {}, args: [] };
  const ok = await openInNewWindow({ agent, args: [...wiring.args, ...(opts.args ?? [])], env: wiring.env });
  if (ok) recordUsage(agent.name);
  return ok;
}

export async function launchAgent(agent: Agent, extraArgs: string[], opts: LaunchOptions = {}): Promise<number> {
  if (opts.window) {
    if (await openAgentWindow(agent, { free: opts.free, args: extraArgs })) return 0;
    console.log(gray("· could not open a new terminal window — starting here"));
  }

  let found = findBinary(agent);
  if (!found) {
    if (!(await installAgent(agent, opts))) return 1;
    found = findBinary(agent);
    if (!found) return 1;
  }

  const state = loadState();
  if (!state.seenAuth.includes(agent.name) && agent.auth && !opts.free) {
    console.log(gray(`· ${agent.name} login: ${stripEmoji(agent.auth)}${agent.url ? `\n  ${agent.url}` : ""}`));
    state.seenAuth.push(agent.name);
    saveState(state);
  }
  recordUsage(agent.name);

  const [, ...cmdArgs] = agent.command.split(/\s+/);
  let args = [...cmdArgs, ...extraArgs];
  let env: NodeJS.ProcessEnv = process.env;
  if (opts.free) {
    const wiring = await freeWiring(agent);
    env = { ...process.env, ...wiring.env };
    args = [...wiring.args, ...args];
    console.log(green(`● ${agent.name} → Atlas free models (${wiring.env.OPENAI_BASE_URL})`));
    if (!ATLAS_READY.has(agent.binary)) console.log(gray('  OPENAI_BASE_URL / OPENAI_API_KEY are set; pick model "auto" in the agent if it asks.'));
  }

  const bin = found.path;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(bin)) {
    return run([bin, ...args].map(quoteWin).join(" "), [], { shell: true, env });
  }
  return run(bin, args, { env });
}
