import { atlasHome } from "@the-atlas/core";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type AuthClass = "free" | "browser" | "key" | "paid" | "none";

export interface Agent {
  name: string;
  binary: string;
  command: string;
  install: string;
  description: string;
  category: string;
  auth: string;
  url: string;
  authClass: AuthClass;
  /** Defined in the user's own agents.conf, not the bundled catalog. */
  custom: boolean;
}

/** Same priority as Aidevix: 🆓 wins, then subscription, browser, key. */
export function classifyAuth(auth: string): AuthClass {
  if (/🆓|bepul|free/i.test(auth)) return "free";
  if (auth.includes("💳")) return "paid";
  if (auth.includes("🌐")) return "browser";
  if (auth.includes("🔑")) return "key";
  return "none";
}

export function parseCatalog(text: string, custom = false): Agent[] {
  const out: Agent[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const f = line.split("|").map((s) => s.trim());
    if (f.length < 6 || !f[0] || !f[1] || !f[2]) continue;
    const auth = f[6] ?? "";
    out.push({
      name: f[0],
      binary: f[1],
      command: f[2],
      install: f[3] ?? "",
      description: f[4] ?? "",
      category: f[5] ?? "",
      auth,
      url: f[7] ?? "",
      authClass: classifyAuth(auth),
      custom,
    });
  }
  return out;
}

function bundledCatalogPath(): string {
  // dist/index.js → ../agents.conf ; src/agents/catalog.ts → ../../agents.conf
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, "..", "agents.conf"), join(here, "..", "..", "agents.conf")]) if (existsSync(p)) return p;
  throw new Error("agents.conf not found");
}

/** Bundled catalog wins on duplicate names, so a user file can't silently swap a known installer. */
export function loadAgents(): Agent[] {
  const agents = parseCatalog(readFileSync(bundledCatalogPath(), "utf8"));
  const userPath = join(atlasHome(), "agents.conf");
  if (existsSync(userPath)) {
    const known = new Set(agents.map((a) => a.name.toLowerCase()));
    for (const a of parseCatalog(readFileSync(userPath, "utf8"), true)) if (!known.has(a.name.toLowerCase())) agents.push(a);
  }
  return agents;
}

export function findAgent(agents: Agent[], query: string): Agent | undefined {
  const q = query.toLowerCase();
  return (
    agents.find((a) => a.name.toLowerCase() === q || a.binary.toLowerCase() === q) ??
    agents.find((a) => a.name.toLowerCase().includes(q) || a.binary.toLowerCase().includes(q))
  );
}

let extraDirsCache: string[] | undefined;

/** Global bin dirs that are often missing from PATH on fresh machines (npm, pip --user, cargo, go). */
export function extraBinDirs(): string[] {
  if (extraDirsCache) return extraDirsCache;
  const home = homedir();
  const dirs = [join(home, ".local", "bin"), join(home, "bin"), join(home, ".cargo", "bin"), join(home, "go", "bin"), "/usr/local/bin", "/opt/homebrew/bin"];
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    dirs.push(join(appdata, "npm"));
    const py = join(appdata, "Python");
    try {
      for (const d of readdirSync(py)) if (/^Python3/i.test(d)) dirs.push(join(py, d, "Scripts"));
    } catch {
      // no user-site Python
    }
  }
  try {
    const prefix = execSync("npm config get prefix", { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (prefix) dirs.push(prefix, join(prefix, "bin"));
  } catch {
    // npm missing
  }
  extraDirsCache = dirs;
  return dirs;
}

/** Full path of an executable, searching PATH plus extraBinDirs(). */
export function which(binary: string, extra = true): string | undefined {
  const exts = process.platform === "win32" ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.PS1").toLowerCase().split(";")] : [""];
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  if (extra) dirs.push(...extraBinDirs());
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = join(dir, binary + ext);
      try {
        if (statSync(p).isFile()) return p;
      } catch {
        // not here
      }
    }
  }
  return undefined;
}

/** Network-piped installers (`bash -c "$(curl …)"`) run remote code; we flag them in the UI. */
export function isRemoteScript(install: string): boolean {
  return /curl|wget|iwr|Invoke-WebRequest/i.test(install);
}

/** Windows has `python`, not `python3`; npm shims are fine as-is. */
export function resolveInstall(install: string): string {
  if (process.platform === "win32") return install.replace(/\bpython3\b/g, "python");
  return install;
}
