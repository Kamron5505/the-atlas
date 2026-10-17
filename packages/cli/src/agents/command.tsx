import type { Command } from "commander";
import { render } from "ink";
import { findAgent, findBinary, loadAgents, type Agent } from "./catalog.js";
import { AgentMenu, AUTH_TAG, sortRows, type MenuResult, type MenuRow } from "./Menu.js";
import { loadConfig } from "@the-atlas/core";
import { detectLang, t } from "../i18n.js";
import { a } from "../ui/ansi.js";
import { stripEmoji } from "../ui/theme.js";
import { installAgent, launchAgent } from "./run.js";
import { loadState } from "./state.js";

export function rowsFor(agents: Agent[]): MenuRow[] {
  const s = loadState();
  return sortRows(agents.map((agent) => ({ agent, installed: !!findBinary(agent), uses: s.usage[agent.name] ?? 0, last: s.last === agent.name })));
}

function printList(rows: MenuRow[]): void {
  for (const r of rows) {
    const status = r.installed ? a.ok("●") : a.faint("○");
    const uses = r.uses ? `${r.uses}×` : "";
    console.log(`  ${status} ${a.text(r.agent.name.padEnd(18))} ${a.tag(AUTH_TAG[r.agent.authClass])}  ${a.dim(r.agent.binary.padEnd(13))} ${a.dim(r.agent.category.padEnd(7))} ${a.dim(uses.padEnd(4))} ${a.faint(stripEmoji(r.agent.description))}`);
  }
  console.log(a.faint(`\n  ${a.tag("free")} free tier   ${a.tag("key")} API key   ${a.tag("login")} browser login   ${a.tag("paid")} subscription`));
}

export async function runAgentsMenu(opts: { free?: boolean; installed?: boolean; list?: boolean } = {}): Promise<void> {
  const lang = detectLang(loadConfig());
  let rows = rowsFor(loadAgents(lang));
  if (opts.free) rows = rows.filter((r) => r.agent.authClass === "free");
  if (opts.installed) rows = rows.filter((r) => r.installed);
  if (opts.list || !process.stdin.isTTY) return printList(rows);

  let picked: MenuResult | null = null;
  const app = render(<AgentMenu rows={rows} L={t(lang)} onPick={(r) => (picked = r)} />);
  await app.waitUntilExit();
  const choice = picked as MenuResult | null;
  if (!choice) return;
  // Installs (if needed) and runs in a new terminal window; falls back to this one.
  process.exitCode = await launchAgent(choice.agent, [], { free: choice.free, window: true });
  if (process.exitCode === 0) console.log(`${a.ok("✔")} ${a.bold(choice.agent.name)} ${a.dim(t(lang).opened)}`);
}

export function registerAgents(program: Command): void {
  program
    .command("agents")
    .description("pick, install and launch 45+ AI CLI agents")
    .option("-l, --list", "print the catalog")
    .option("-f, --free", "only free agents")
    .option("-i, --installed", "only installed agents")
    .action((opts: { list?: boolean; free?: boolean; installed?: boolean }) => runAgentsMenu(opts));

  program
    .command("run")
    .description("launch an agent by name (installs it if missing)")
    .argument("<agent>", "agent name or binary, e.g. aider")
    .argument("[args...]", "arguments passed to the agent")
    .option("--free", "route the agent through Atlas free models")
    .option("-w, --window", "open in a new terminal window")
    .option("-y, --yes", "install without asking")
    .allowUnknownOption()
    .action(async (name: string, args: string[], opts: { free?: boolean; yes?: boolean; window?: boolean }) => {
      const agent = findAgent(loadAgents(), name);
      if (!agent) {
        console.error(`✗ unknown agent: ${name}. See: atlas agents --list`);
        process.exitCode = 1;
        return;
      }
      process.exitCode = await launchAgent(agent, args, opts);
    });

  program
    .command("install")
    .description("install an agent")
    .argument("<agent>")
    .option("-y, --yes", "do not ask")
    .action(async (name: string, opts: { yes?: boolean }) => {
      const agent = findAgent(loadAgents(), name);
      if (!agent) {
        console.error(`✗ unknown agent: ${name}`);
        process.exitCode = 1;
        return;
      }
      if (findBinary(agent)) return console.log(`${a.ok("✔")} ${agent.name} already installed`);
      process.exitCode = (await installAgent(agent, opts)) ? 0 : 1;
    });
}
