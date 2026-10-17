import { atlasHome } from "@the-atlas/core";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extraBinDirs, installFor, isRemoteScript, which, type Agent } from "./catalog.js";

export interface WindowLaunch {
  agent: Agent;
  args?: string[];
  cwd?: string;
  /** Extra env (e.g. Atlas proxy wiring). New windows don't inherit our env, so it is written into the script. */
  env?: Record<string, string>;
  /** Install the agent first if it is missing. */
  install?: boolean;
}

const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function bashPath(): string | undefined {
  const p = which("bash");
  if (p && !/system32/i.test(p)) return p;
  return which("bash", false) ?? undefined;
}

/** PowerShell script: title, env, install-if-missing, run, keep window open. */
export function buildPs1(o: WindowLaunch): string {
  const { agent } = o;
  const install = o.install === false ? null : installFor(agent, "win32");
  const [, ...cmdArgs] = agent.command.split(/\s+/);
  const args = [...cmdArgs, ...(o.args ?? [])].map(psq).join(" ");
  const names = agent.binaries.map(psq).join(", ");
  let installLine = "";
  if (install) {
    // bash one-liners need Git Bash; PowerShell/winget/npm/pip lines run as-is.
    if (/^bash\s/.test(install)) {
      const bash = bashPath();
      // Hand the whole one-liner to bash so its own "$(curl …)" expansion runs there.
      installLine = bash ? `& ${psq(bash)} -lc ${psq(install)}` : `Write-Host '  ✗ Git Bash is required: https://git-scm.com' -ForegroundColor Red; return`;
    } else installLine = install;
  }
  const lines = [
    "$ErrorActionPreference = 'Continue'",
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    `$Host.UI.RawUI.WindowTitle = ${psq(`Atlas · ${agent.name}`)}`,
    `Set-Location -LiteralPath ${psq(o.cwd ?? process.cwd())}`,
    `$env:Path = ${psq(extraBinDirs().join(";"))} + ';' + $env:Path`,
    ...Object.entries(o.env ?? {}).map(([k, v]) => `$env:${k} = ${psq(v)}`),
    `function Find-Agent { foreach ($n in @(${names})) { $c = Get-Command $n -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { return $c.Source } }; return $null }`,
    "Write-Host ''",
    `Write-Host '  ◆ ATLAS  ' -ForegroundColor Cyan -NoNewline; Write-Host ${psq(agent.name)}`,
    "Write-Host ''",
    "$bin = Find-Agent",
    "if (-not $bin) {",
    install
      ? `  Write-Host ${psq(`  › ${install}`)} -ForegroundColor DarkGray\n  ${installLine}\n  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:Path\n  $bin = Find-Agent`
      : `  Write-Host ${psq(`  ✗ ${agent.name}: no Windows installer. ${agent.url}`)} -ForegroundColor Red`,
    `  if (-not $bin) { Write-Host ${psq(`  ✗ ${agent.name} is not on PATH yet. Reopen the terminal or run: atlas doctor`)} -ForegroundColor Red; return }`,
    "}",
    `& $bin ${args}`,
  ];
  return lines.join("\r\n") + "\r\n";
}

/** POSIX script for macOS / Linux terminals. */
export function buildSh(o: WindowLaunch): string {
  const { agent } = o;
  const install = o.install === false ? null : installFor(agent, process.platform === "win32" ? "linux" : process.platform);
  const [, ...cmdArgs] = agent.command.split(/\s+/);
  const args = [...cmdArgs, ...(o.args ?? [])].map(shq).join(" ");
  return [
    "#!/usr/bin/env bash",
    `printf '\\033]0;%s\\007' ${shq(`Atlas · ${agent.name}`)}`,
    `cd ${shq(o.cwd ?? process.cwd())} || true`,
    `export PATH=${shq(extraBinDirs().join(":"))}:"$PATH"`,
    ...Object.entries(o.env ?? {}).map(([k, v]) => `export ${k}=${shq(v)}`),
    `find_agent() { for n in ${agent.binaries.map(shq).join(" ")}; do command -v "$n" >/dev/null 2>&1 && { echo "$n"; return; }; done; }`,
    `printf '\\n  \\033[36m◆ ATLAS\\033[0m  %s\\n\\n' ${shq(agent.name)}`,
    'bin=$(find_agent)',
    'if [ -z "$bin" ]; then',
    install ? `  printf '  \\033[90m› %s\\033[0m\\n' ${shq(install)}\n  ${install}\n  hash -r; bin=$(find_agent)` : `  echo ${shq(`  ✗ ${agent.name}: install manually → ${agent.url}`)}`,
    "fi",
    `if [ -n "$bin" ]; then "$bin" ${args}; else echo ${shq("  ✗ not on PATH yet — reopen the terminal or run: atlas doctor")}; fi`,
    'exec "${SHELL:-bash}"',
  ].join("\n") + "\n";
}

function detached(cmd: string, args: string[], opts: { verbatim?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsVerbatimArguments: opts.verbatim });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Opens the agent in a NEW terminal window (Windows Terminal → PowerShell window,
 * macOS Terminal, Linux terminal emulators). Returns false if no window could be opened.
 */
export async function openInNewWindow(o: WindowLaunch): Promise<boolean> {
  const dir = join(atlasHome(), "run");
  mkdirSync(dir, { recursive: true });
  const title = `Atlas · ${o.agent.name}`;
  const cwd = o.cwd ?? process.cwd();

  if (process.platform === "win32") {
    const file = join(dir, `${slug(o.agent.name)}.ps1`);
    // BOM so Windows PowerShell 5.1 reads the script as UTF-8.
    writeFileSync(file, `﻿${buildPs1(o)}`, "utf8");
    const ps = ["powershell.exe", "-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-File", file];
    if (which("wt", false) && (await detached("wt.exe", ["-w", "new", "--title", title, "-d", cwd, ...ps]))) return true;
    return detached("cmd.exe", [`/d /c start "${title}" ${ps.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(" ")}`], { verbatim: true });
  }

  const file = join(dir, `${slug(o.agent.name)}.sh`);
  writeFileSync(file, buildSh(o), { mode: 0o755 });
  if (process.platform === "darwin") {
    const script = `tell application "Terminal" to do script "bash ${file.replace(/"/g, '\\"')}"`;
    return detached("osascript", ["-e", script, "-e", 'tell application "Terminal" to activate']);
  }
  for (const [term, ...pre] of [
    ["x-terminal-emulator", "-e"],
    ["gnome-terminal", "--"],
    ["konsole", "-e"],
    ["xfce4-terminal", "-x"],
    ["kitty"],
    ["alacritty", "-e"],
    ["xterm", "-e"],
  ] as const) {
    if (which(term, false) && (await detached(term, [...pre, "bash", file]))) return true;
  }
  return false;
}

/** Human-readable install plan for the confirm prompt. */
export function installPlan(agent: Agent): { command: string | null; remote: boolean } {
  const command = installFor(agent);
  return { command, remote: !!command && (isRemoteScript(command) || /\birm\b/.test(command)) };
}
