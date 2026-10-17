import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { colorDepth, emojiSupported, paint, pipedColorDepth, unicodeSupported, type ColorDepth } from "./ui/term.js";

type RGB = [number, number, number];

const GREEN: RGB = [0, 200, 80];
const YELLOW: RGB = [220, 200, 0];
const RED: RGB = [220, 40, 20];
const EMPTY: RGB = [60, 60, 60];
const DIM: RGB = [110, 110, 110];
const REPO: RGB = [255, 214, 10];
const CYAN: RGB = [0, 220, 255];
const MAGENTA: RGB = [220, 90, 230];

/** How to draw: colour depth, emoji markers, Unicode bar blocks. */
export interface StatusStyle {
  depth: ColorDepth;
  emoji: boolean;
  unicode: boolean;
}

/**
 * In the Atlas TUI (stdout is a TTY) detect the terminal; piped to Claude Code,
 * assume a modern renderer unless env says otherwise (NO_COLOR, ATLAS_ASCII, TERM=dumb...).
 */
export function statusStyle(): StatusStyle {
  return {
    depth: process.stdout.isTTY ? colorDepth() : pipedColorDepth(),
    emoji: emojiSupported(),
    unicode: unicodeSupported(),
  };
}

const fg = (rgb: RGB, s: string, depth: ColorDepth) => paint(rgb, s, depth);
const bold = (s: string, depth: ColorDepth) => (depth > 1 ? `\x1b[1m${s}\x1b[22m` : s);
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;

/** green(0,200,80) → yellow(220,200,0) → red(220,40,20) at t ∈ [0,1]. */
export function gradient(t: number): RGB {
  const x = Math.min(1, Math.max(0, t));
  return x <= 0.5 ? mix(GREEN, YELLOW, x / 0.5) : mix(YELLOW, RED, (x - 0.5) / 0.5);
}

/** Context-usage marker; text (OK / MID / HOT / MAX) when emoji can't be drawn. */
export function usageMarker(pct: number, emoji: boolean): string {
  if (pct >= 90) return emoji ? "🚨" : "MAX";
  if (pct >= 70) return emoji ? "🔥" : "HOT";
  if (pct >= 20) return emoji ? "⚡️" : "MID";
  return emoji ? "🟢" : "OK";
}

export function usageEmoji(pct: number): string {
  return usageMarker(pct, true);
}

/** 20 blocks; filled ones carry the gradient of their position, empty ones are dark gray. ASCII: # and . */
export function contextBar(pct: number, blocks = 20, style: StatusStyle = statusStyle()): string {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * blocks);
  let out = "";
  for (let i = 0; i < blocks; i++) {
    const on = i < filled;
    out += fg(on ? gradient(i / (blocks - 1)) : EMPTY, style.unicode ? "█" : on ? "#" : ".", style.depth);
  }
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
 * Single line, dim gray pipes between elements. Without emoji / Unicode:
 * repo | br:(branch) | MID ####.... 12% | $0.00 | +10 -2 | ai: model
 */
export function renderStatusline(d: StatusData, style: StatusStyle = statusStyle()): string {
  const pct = Math.round(Math.min(100, Math.max(0, d.usedPct)));
  const c = (rgb: RGB, s: string) => fg(rgb, s, style.depth);
  const b = (s: string) => bold(s, style.depth);
  const sep = c(DIM, " | ");
  const parts = [
    b(c(REPO, d.repo)),
    d.branch ? `${style.emoji ? "🌿 " : "br:"}${b(c(CYAN, `(${d.branch})`))}` : undefined,
    `${usageMarker(pct, style.emoji)} ${contextBar(pct, 20, style)} ${c(gradient(pct / 100), `${pct}%`)}`,
    c(YELLOW, `$${d.costUsd.toFixed(2)}`),
    `${c(GREEN, `+${d.added}`)} ${c(RED, `-${d.removed}`)}`,
    `${style.emoji ? "🤖 " : "ai: "}${c(MAGENTA, d.model)}`,
  ];
  return parts.filter(Boolean).join(sep);
}

export interface GitInfo {
  repo: string;
  branch?: string;
  added: number;
  removed: number;
}

/**
 * Repo config is untrusted (the status line runs in any folder): turn off
 * core.fsmonitor and external diff drivers, which would run commands from it.
 */
export const GIT_SAFE = ["-c", "core.fsmonitor=false", "-c", "diff.external=", "--no-optional-locks"];

function git(args: string, cwd: string): string | undefined {
  try {
    return execFileSync("git", [...GIT_SAFE, ...args.split(" ")], { cwd, encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
  } catch {
    return undefined;
  }
}

/** Repo name, branch and uncommitted +/- lines ("code velocity") for a folder. */
export function gitInfo(cwd: string): GitInfo {
  const top = git("rev-parse --show-toplevel", cwd);
  if (!top) return { repo: basename(cwd), added: 0, removed: 0 };
  const branch = git("branch --show-current", cwd) || git("rev-parse --short HEAD", cwd);
  const stat = git("diff --no-ext-diff --no-textconv --shortstat HEAD", cwd) ?? "";
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
