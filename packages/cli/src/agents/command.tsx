import type { Command } from "commander";
import { render } from "ink";
import { findAgent, loadAgents, which, type Agent } from "./catalog.js";
import { AgentMenu, AUTH_BADGE, sortRows, type MenuResult, type MenuRow } from "./Menu.js";
import { installAgent, launchAgent } from "./run.js";
import { loadState } from "./state.js";

function rowsFor(agents: Agent[]): MenuRow[] {
  const s = loadState();
  return sortRows(agents.map((agent) => ({ agent, installed: !!which(agent.binary), uses: s.usage[agent.name] ?? 0, last: s.last === agent.name })));
}

function printList(rows: MenuRow[]): void {
  for (const r of rows) {
    const b = AUTH_BADGE[r.agent.authClass];
    const status = r.installed ? "\x1b[32m●\x1b[0m" : "\x1b[90m○\x1b[0m";
    console.log(`${status} ${r.agent.name.padEnd(18)} ${b.icon}  ${r.agent.binary.padEnd(13)} ${r.agent.category.padEnd(7)} ${r.uses ? `${r.uses}×`.padEnd(4) : "    "} \x1b[90m${r.agent.description}\x1b[0m`);
  }
  console.log("\x1b[90m🆓 free · 🔑 API key · 🌐 browser login · 💳 subscription\x1b[0m");
}

export async function runAgentsMenu(opts: { free?: boolean; installed?: boolean; list?: boolean } = {}): Promise<void> {
  let rows = rowsFor(loadAgents());
  if (opts.free) rows = rows.filter((r) => r.agent.authClass === "free");
  if (opts.installed) rows = rows.filter((r) => r.installed);
  if (opts.list || !process.stdin.isTTY) return printList(rows);

  let picked: MenuResult | null = null;
  const app = render(<AgentMenu rows={rows} onPick={(r) => (picked = r)} />);
  await app.waitUntilExit();
  const choice = picked as MenuResult | null;
  if (!choice) return;
  process.exitCode = await launchAgent(choice.agent, [], { free: choice.free });
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
    .option("-y, --yes", "install without asking")
    .allowUnknownOption()
    .action(async (name: string, args: string[], opts: { free?: boolean; yes?: boolean }) => {
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
      if (which(agent.binary)) return console.log(`✓ ${agent.name} already installed`);
      process.exitCode = (await installAgent(agent, opts)) ? 0 : 1;
    });
}
