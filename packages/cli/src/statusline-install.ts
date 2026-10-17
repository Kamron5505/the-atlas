import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { confirm } from "./agents/run.js";
import { a } from "./ui/ansi.js";

export function claudeSettingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

export const STATUSLINE = { type: "command", command: "atlas statusline", padding: 0 } as const;

/** Points Claude Code's statusLine at `atlas statusline`. Backs up settings.json first. */
export async function installClaudeStatusline(yes = false): Promise<boolean> {
  const file = claudeSettingsPath();
  let settings: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      console.error(a.err(`✗ ${file} is not valid JSON — not touching it`));
      return false;
    }
  }
  const current = settings.statusLine as { command?: string } | undefined;
  if (current?.command === STATUSLINE.command) {
    console.log(`${a.ok("✔")} Claude Code already uses the Atlas status line`);
    return true;
  }
  console.log(`${a.bold("Claude Code")} · ${a.dim(file)}`);
  if (current) console.log(a.warn(`  ! replaces your current statusLine: ${JSON.stringify(current)}`));
  console.log(a.dim(`  statusLine → ${JSON.stringify(STATUSLINE)}`));
  if (!yes && !(await confirm("Apply?"))) return false;

  mkdirSync(join(file, ".."), { recursive: true });
  if (existsSync(file)) {
    const backup = `${file}.atlas-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, backup);
    console.log(a.dim(`  backup: ${backup}`));
  }
  settings.statusLine = STATUSLINE;
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  console.log(`${a.ok("✔")} ${a.bold("Claude Code")} status line installed — restart Claude Code`);
  return true;
}
