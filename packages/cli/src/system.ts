import { spawn } from "node:child_process";
import { which } from "./agents/catalog.js";

/** Opens an http(s) URL in the default browser without going through a shell. */
export function openUrl(url: string): boolean {
  if (!/^https?:\/\/[^\s"'`]+$/.test(url)) return false;
  const [cmd, args] =
    process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return true;
  } catch {
    return false;
  }
}

export const OMNIROUTE_URL = "http://localhost:20128";

export async function omnirouteUp(base = OMNIROUTE_URL): Promise<boolean> {
  try {
    const res = await fetch(`${base.replace(/\/v1\/?$/, "")}/v1/models`, { signal: AbortSignal.timeout(1500) });
    // 401 still means the gateway is running (REQUIRE_API_KEY=true).
    return res.ok || res.status === 401;
  } catch {
    return false;
  }
}

export function omnirouteInstalled(): boolean {
  return !!which("omniroute");
}

function exec(cmd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export function installOmniroute(): Promise<number> {
  return exec("npm install -g omniroute@latest");
}

/** Starts OmniRoute in the background and waits until it answers. */
export async function startOmniroute(timeoutMs = 30000): Promise<boolean> {
  const bin = which("omniroute");
  if (!bin) return false;
  const win = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
  const child = win
    ? spawn(`"${bin}"`, { shell: true, detached: true, stdio: "ignore", windowsHide: true })
    : spawn(bin, [], { detached: true, stdio: "ignore" });
  child.unref();
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await omnirouteUp()) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}
