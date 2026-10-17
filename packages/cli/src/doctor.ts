import { configPath, listModels, loadConfig, readyProviders } from "@the-atlas/core";
import { execSync } from "node:child_process";
import { which } from "./agents/catalog.js";

import { a } from "./ui/ansi.js";

const ok = (s: string) => `  ${a.ok("✓")} ${s}`;
const warn = (s: string) => `  ${a.warn("!")} ${s}`;
const bad = (s: string) => `  ${a.err("✗")} ${s}`;
const ms = (n: number) => (n < 300 ? a.ok : n < 1000 ? a.warn : a.err)(`${n} ms`.padStart(7));

const TOOL_HINT: Record<string, string> = {
  npm: "install Node.js 22+: https://nodejs.org",
  git: "https://git-scm.com/downloads",
  bash: "Windows: Git for Windows gives you bash — https://git-scm.com",
  python: "https://www.python.org/downloads (tick “Add to PATH”)",
  python3: "https://www.python.org/downloads",
};

function version(bin: string): string | undefined {
  try {
    // bin comes from a fixed list, never from user input.
    return execSync(`${bin} --version`, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .split("\n")[0];
  } catch {
    return undefined;
  }
}

export async function doctor(): Promise<void> {
  console.log(a.neon(a.bold("◆ Environment")));
  const major = Number(process.versions.node.split(".")[0]);
  console.log(major >= 22 ? ok(`node ${process.versions.node}`) : bad(`node ${process.versions.node} — need 22+`));
  const py = process.platform === "win32" ? "python" : "python3";
  for (const tool of ["npm", "git", "bash", py]) {
    const path = which(tool);
    const v = path && !(tool === "python" && /WindowsApps/i.test(path)) ? version(tool) : undefined;
    if (v) console.log(ok(`${tool} ${v}`));
    else console.log(warn(`${tool} not found — ${TOOL_HINT[tool] ?? ""}`));
  }
  console.log(ok(`config ${configPath()}`));

  console.log(`\n${a.neon(a.bold("◆ Providers"))}`);
  const cfg = loadConfig();
  const ready = readyProviders(cfg);
  if (!ready.length) console.log(warn("no providers — atlas keys add openrouter"));
  await Promise.all(
    ready.map(async (p) => {
      const t0 = Date.now();
      try {
        const models = await listModels(p, AbortSignal.timeout(8000));
        return ok(`${p.def.id.padEnd(11)} ${ms(Date.now() - t0)}  ${models.length} models`);
      } catch (err) {
        return (p.def.keyRequired ? bad : warn)(`${p.def.id.padEnd(11)} ${(err as Error).message}`);
      }
    }),
  ).then((lines) => lines.forEach((l) => console.log(l)));
}
