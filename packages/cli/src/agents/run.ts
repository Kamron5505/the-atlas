import { loadConfig, saveConfig, startServer } from "@the-atlas/core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createInterface } from "node:readline/promises";
import { isRemoteScript, resolveInstall, which, type Agent } from "./catalog.js";
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
  if (!agent.install) {
    console.log(yellow(`! ${agent.name}: install manually → ${agent.url}`));
    return false;
  }
  const install = resolveInstall(agent.install);
  console.log(`${agent.name} is not installed.\n  ${gray("$")} ${install}`);
  if (isRemoteScript(install)) console.log(yellow("  ! downloads and runs a remote install script"));
  if (agent.custom) console.log(yellow("  ! custom agent from your agents.conf — not verified by The Atlas"));
  if (!opts.yes && !(await confirm("Install now?"))) return false;

  let code: number;
  if (/^bash\s/.test(install) || isRemoteScript(install)) {
    const bash = findBash();
    if (!bash) {
      console.log(yellow("! needs bash (Git for Windows: https://git-scm.com) or WSL"));
      return false;
    }
    code = await run(bash, ["-c", install]);
  } else {
    code = await run(install, [], { shell: true });
  }
  if (code !== 0) {
    console.log(yellow(`✗ install failed (exit ${code}). Check internet / permissions, or run it manually.`));
    return false;
  }
  if (!which(agent.binary)) {
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

function quoteWin(a: string): string {
  return /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

export async function launchAgent(agent: Agent, extraArgs: string[], opts: { yes?: boolean; free?: boolean } = {}): Promise<number> {
  let bin = which(agent.binary);
  if (!bin) {
    if (!(await installAgent(agent, opts))) return 1;
    bin = which(agent.binary);
    if (!bin) return 1;
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
  let server: import("node:http").Server | undefined;

  if (opts.free) {
    const cfg = loadConfig();
    if (!cfg.serveToken) {
      cfg.serveToken = `atlas-${randomBytes(18).toString("base64url")}`;
      saveConfig(cfg);
    }
    server = await startServer(cfg, { port: 0, token: cfg.serveToken });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    const wiring = atlasWiring(agent, url, cfg.serveToken);
    env = { ...process.env, ...wiring.env };
    args = [...wiring.args, ...args];
    console.log(green(`● ${agent.name} → Atlas free models (${url})`));
    if (!ATLAS_READY.has(agent.binary)) console.log(gray("  OPENAI_BASE_URL / OPENAI_API_KEY are set; pick model \"auto\" in the agent if it asks."));
  }

  try {
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(bin)) {
      return await run([bin, ...args].map(quoteWin).join(" "), [], { shell: true, env });
    }
    return await run(bin, args, { env });
  } finally {
    server?.close();
  }
}
