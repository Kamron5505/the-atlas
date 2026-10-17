import { execSync } from "node:child_process";
import { basename } from "node:path";

type RGB = [number, number, number];

const GREEN: RGB = [0, 200, 80];
const YELLOW: RGB = [220, 200, 0];
const RED: RGB = [220, 40, 20];
const EMPTY: RGB = [60, 60, 60];
const DIM: RGB = [110, 110, 110];
const REPO: RGB = [255, 214, 10];
const CYAN: RGB = [0, 220, 255];
const MAGENTA: RGB = [220, 90, 230];

const fg = ([r, g, b]: RGB, s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;

/** green(0,200,80) → yellow(220,200,0) → red(220,40,20) at t ∈ [0,1]. */
export function gradient(t: number): RGB {
  const x = Math.min(1, Math.max(0, t));
  return x <= 0.5 ? mix(GREEN, YELLOW, x / 0.5) : mix(YELLOW, RED, (x - 0.5) / 0.5);
}

export function usageEmoji(pct: number): string {
  if (pct >= 90) return "🚨";
  if (pct >= 70) return "🔥";
  if (pct >= 20) return "⚡️";
  return "🟢";
}

/** 20 blocks; filled ones carry the gradient of their position, empty ones are dark gray. */
export function contextBar(pct: number, blocks = 20): string {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * blocks);
  let out = "";
  for (let i = 0; i < blocks; i++) out += fg(i < filled ? gradient(i / (blocks - 1)) : EMPTY, "█");
  return out;
}

export interface StatusData {
  repo: string;
  branch?: string;
  /** Context window used, 0–100. */
  usedPct: number;
  costUsd: number;
  added: number;
  removed: number;
  model: string;
}

/**
 * repo │ 🌿 (branch) │ 🟢 ████░░ 12% │ $0.00 │ +10 -2 │ 🤖 model
 * Single line, truecolor, dim gray pipes between elements.
 */
export function renderStatusline(d: StatusData): string {
  const pct = Math.round(Math.min(100, Math.max(0, d.usedPct)));
  const sep = fg(DIM, " | ");
  const parts = [
    bold(fg(REPO, d.repo)),
    d.branch ? `🌿 ${bold(fg(CYAN, `(${d.branch})`))}` : undefined,
    `${usageEmoji(pct)} ${contextBar(pct)} ${fg(gradient(pct / 100), `${pct}%`)}`,
    fg(YELLOW, `$${d.costUsd.toFixed(2)}`),
    `${fg(GREEN, `+${d.added}`)} ${fg(RED, `-${d.removed}`)}`,
    `🤖 ${fg(MAGENTA, d.model)}`,
  ];
  return parts.filter(Boolean).join(sep);
}

export interface GitInfo {
  repo: string;
  branch?: string;
  added: number;
  removed: number;
}

function git(args: string, cwd: string): string | undefined {
  try {
    return execSync(`git ${args}`, { cwd, encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

/** Repo name, branch and uncommitted +/- lines ("code velocity") for a folder. */
export function gitInfo(cwd: string): GitInfo {
  const top = git("rev-parse --show-toplevel", cwd);
  if (!top) return { repo: basename(cwd), added: 0, removed: 0 };
  const branch = git("branch --show-current", cwd) || git("rev-parse --short HEAD", cwd);
  const stat = git("diff --shortstat HEAD", cwd) ?? "";
  return {
    repo: basename(top),
    branch,
    added: Number(/(\d+) insertion/.exec(stat)?.[1] ?? 0),
    removed: Number(/(\d+) deletion/.exec(stat)?.[1] ?? 0),
  };
}

/** Subset of the JSON Claude Code pipes to a statusLine command. */
interface ClaudeStatusInput {
  cwd?: string;
  model?: { id?: string; display_name?: string };
  workspace?: { current_dir?: string; project_dir?: string; repo?: { name?: string } };
  cost?: { total_cost_usd?: number; total_lines_added?: number; total_lines_removed?: number };
  context_window?: {
    context_window_size?: number;
    used_percentage?: number | null;
    current_usage?: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null;
  };
}

/** Context % per Claude Code docs: input tokens only (input + cache creation + cache read) / window. */
export function claudeUsedPct(input: ClaudeStatusInput): number {
  const cw = input.context_window;
  if (!cw) return 0;
  if (typeof cw.used_percentage === "number") return cw.used_percentage;
  const u = cw.current_usage;
  if (!u || !cw.context_window_size) return 0;
  return (((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)) / cw.context_window_size) * 100;
}

/** Builds the status line from Claude Code's stdin JSON. */
export function claudeStatusline(json: string): string {
  let input: ClaudeStatusInput = {};
  try {
    input = JSON.parse(json) as ClaudeStatusInput;
  } catch {
    // bad input → still print something useful
  }
  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();
  const g = gitInfo(cwd);
  return renderStatusline({
    repo: input.workspace?.repo?.name ?? g.repo,
    branch: g.branch,
    usedPct: claudeUsedPct(input),
    costUsd: input.cost?.total_cost_usd ?? 0,
    added: input.cost?.total_lines_added ?? g.added,
    removed: input.cost?.total_lines_removed ?? g.removed,
    model: input.model?.display_name ?? input.model?.id ?? "claude",
  });
}
