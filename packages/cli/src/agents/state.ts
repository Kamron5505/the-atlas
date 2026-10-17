import { atlasHome } from "@the-atlas/core";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface AgentState {
  usage: Record<string, number>;
  last?: string;
  seenAuth: string[];
}

const path = () => join(atlasHome(), "agents-state.json");

export function loadState(): AgentState {
  try {
    if (existsSync(path())) return { usage: {}, seenAuth: [], ...(JSON.parse(readFileSync(path(), "utf8")) as Partial<AgentState>) };
  } catch {
    // corrupted state is not worth failing over
  }
  return { usage: {}, seenAuth: [] };
}

/** Atomic write: a crash mid-write never leaves half a file. */
export function saveState(s: AgentState): void {
  mkdirSync(atlasHome(), { recursive: true });
  const tmp = `${path()}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, path());
}

export function recordUsage(name: string): void {
  const s = loadState();
  s.usage[name] = (s.usage[name] ?? 0) + 1;
  s.last = name;
  saveState(s);
}
