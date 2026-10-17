import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AgentTool, ToolContext, ToolResult } from "./types.js";

/** Built-in tools may also render an approval preview. */
export interface BuiltinTool extends AgentTool {
  preview?(args: Record<string, unknown>, ctx: ToolContext): string;
}

/** Words used in transcript summaries (localized by the caller). */
export interface ToolWords {
  lines: string;
  entries: string;
  matches: string;
  exit: string;
  timedOut: string;
  created: string;
}

export const EN_WORDS: ToolWords = { lines: "lines", entries: "entries", matches: "matches", exit: "exit", timedOut: "timed out", created: "new" };

const MAX_OUTPUT = 20_000;
const MAX_READ_LINES = 2000;
const MAX_MATCHES = 200;
const MAX_FILES = 20_000;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "build", "coverage", ".turbo"]);

/** Keeps the head and tail of long output. */
export function truncate(s: string, max = MAX_OUTPUT): string {
  if (s.length <= max) return s;
  const half = Math.floor(max / 2);
  return `${s.slice(0, half)}\n… [${s.length - max} chars truncated] …\n${s.slice(-half)}`;
}

/** Secret files the agent must never read or write. */
export function isSecretPath(p: string): boolean {
  const norm = p.replace(/\\/g, "/").toLowerCase();
  const name = basename(norm);
  if (/^\.env(\..*)?$/.test(name) || name.startsWith(".env")) return true;
  if (/\.(pem|key|p12|pfx)$/.test(name)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)/.test(name)) return true;
  const parts = norm.split("/");
  if (parts.includes(".ssh") || parts.includes(".aws")) return true;
  if (norm.endsWith(".the-atlas/config.json") || norm.endsWith(".claude/.credentials.json")) return true;
  return false;
}

export class PathError extends Error {}

const fold = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);

function inside(root: string, target: string): boolean {
  const rel = relative(fold(root), fold(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Real path of the nearest existing ancestor (resolves symlinks for new files too). */
function realish(p: string): string {
  let cur = p;
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) return p;
    tail.unshift(basename(cur));
    cur = parent;
  }
  return join(realpathSync.native(cur), ...tail);
}

/** Resolves a tool path inside the project; throws PathError outside it or on secrets. */
export function safePath(cwd: string, p: unknown): string {
  const raw = typeof p === "string" && p.trim() ? p.trim() : ".";
  const abs = resolve(cwd, raw);
  const root = realpathSync.native(cwd);
  if (!inside(resolve(cwd), abs) || !inside(root, realish(abs))) throw new PathError(`Refused: ${raw} is outside the project folder`);
  if (isSecretPath(abs) || isSecretPath(realish(abs))) throw new PathError(`Refused: ${raw} is a secret file`);
  return abs;
}

const rel = (cwd: string, abs: string) => relative(cwd, abs).split(sep).join("/") || ".";
const str = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new PathError(`Missing argument: ${name}`);
  return v;
};
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
const fail = (output: string): ToolResult => ({ output, isError: true, summary: output });
const lineCount = (s: string) => (s === "" ? 0 : s.split("\n").length - (s.endsWith("\n") ? 1 : 0));

/** Minimal line diff (LCS) as "+"/"-"/" " lines; falls back to all-removed/all-added for huge inputs. */
export function diffLines(a: string, b: string): { lines: string[]; added: number; removed: number } {
  const x = a === "" ? [] : a.replace(/\n$/, "").split("\n");
  const y = b === "" ? [] : b.replace(/\n$/, "").split("\n");
  const out: string[] = [];
  if (x.length * y.length > 4_000_000) {
    for (const l of x) out.push(`-${l}`);
    for (const l of y) out.push(`+${l}`);
    return { lines: out, added: y.length, removed: x.length };
  }
  const n = x.length;
  const m = y.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      out.push(` ${x[i]}`);
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i + 1]![j]! < dp[i]![j + 1]!)) {
      out.push(`+${y[j]}`);
      added++;
      j++;
    } else {
      out.push(`-${x[i]}`);
      removed++;
      i++;
    }
  }
  return { lines: out, added, removed };
}

/** Unified-ish preview: changed lines with 2 lines of context, capped. */
export function previewDiff(path: string, before: string, after: string, maxLines = 60): string {
  const { lines, added, removed } = diffLines(before, after);
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l[0] !== " ") for (let k = i - 2; k <= i + 2; k++) keep.add(k);
  });
  const out = [`${path}  +${added} -${removed}`];
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!keep.has(i)) continue;
    if (last >= 0 && i > last + 1) out.push("@@");
    out.push(lines[i]!);
    last = i;
  }
  if (out.length > maxLines) return [...out.slice(0, maxLines), `… ${out.length - maxLines} more`].join("\n");
  return out.join("\n");
}

function readText(abs: string): string {
  return readFileSync(abs, "utf8");
}

function editResult(content: string, oldS: string, newS: string, all: boolean): { next: string } | { error: string } {
  if (!oldS) return { error: "old_string is empty" };
  // Models send LF; keep CRLF files CRLF.
  if (content.includes("\r\n") && !content.includes(oldS) && !oldS.includes("\r\n") && oldS.includes("\n")) {
    const crlf = (x: string) => x.replace(/\r?\n/g, "\r\n");
    if (content.includes(crlf(oldS))) return editResult(content, crlf(oldS), crlf(newS), all);
  }
  const count = content.split(oldS).length - 1;
  if (count === 0) return { error: "old_string not found in file (it must match exactly, including whitespace)" };
  if (count > 1 && !all) return { error: `old_string occurs ${count} times; add more context to make it unique, or set replace_all` };
  return { next: all ? content.split(oldS).join(newS) : content.replace(oldS, () => newS) };
}

/** Glob → RegExp (supports **, *, ?, {a,b}). Patterns without "/" match the file name. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
        i += glob[i + 2] === "/" ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      depth++;
      re += "(?:";
    } else if (c === "}" && depth > 0) {
      depth--;
      re += ")";
    } else if (c === "," && depth > 0) re += "|";
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, process.platform === "win32" ? "i" : "");
}

function* walk(dir: string, signal?: AbortSignal): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (signal?.aborted) return;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(p, signal);
    } else if (e.isFile()) yield p;
  }
}

/** Kills a process tree (Windows needs taskkill for grandchildren). */
function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
}

/** Shell + args for one command line (PowerShell on Windows, bash elsewhere). */
export function shellFor(command: string): { file: string; args: string[] } {
  return process.platform === "win32"
    ? { file: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`] }
    : { file: "bash", args: ["-lc", command] };
}

export interface CommandResult {
  code: number | null;
  output: string;
  timedOut: boolean;
  aborted: boolean;
}

/** Runs a shell command in cwd, capturing stdout+stderr; kills it on timeout/abort. */
export function runShell(command: string, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<CommandResult> {
  return new Promise((done) => {
    const { file, args } = shellFor(command);
    let out = "";
    let timedOut = false;
    let aborted = false;
    const child = spawn(file, args, { cwd, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    const add = (chunk: string) => {
      out += chunk;
      if (out.length > MAX_OUTPUT * 4) out = truncate(out, MAX_OUTPUT * 2);
    };
    child.stdout?.on("data", add);
    child.stderr?.on("data", add);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    const onAbort = () => {
      aborted = true;
      killTree(child.pid);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const finish = (code: number | null) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      done({ code, output: truncate(out), timedOut, aborted });
    };
    child.on("error", (err) => {
      out += String(err.message);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

const commandLine = (cmd: string) => (process.platform === "win32" ? `PS> ${cmd}` : `$ ${cmd}`);

/** The built-in Atlas tools: read/list/search (no approval), write/edit/run (approval). */
export function builtinTools(w: ToolWords = EN_WORDS): BuiltinTool[] {
  const guard = async (fn: () => Promise<ToolResult> | ToolResult): Promise<ToolResult> => {
    try {
      return await fn();
    } catch (err) {
      return fail((err as Error).message);
    }
  };

  const readFile: BuiltinTool = {
    name: "read_file",
    description: "Read a text file in the project. Returns numbered lines. Use offset/limit (1-based line numbers) for big files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the project root" },
        offset: { type: "number", description: "First line to read (1-based)" },
        limit: { type: "number", description: `Max lines (default ${MAX_READ_LINES})` },
      },
      required: ["path"],
    },
    risk: "read",
    source: "atlas",
    run: (args, ctx) =>
      guard(() => {
        const abs = safePath(ctx.cwd, str(args.path, "path"));
        if (!existsSync(abs)) return fail(`File not found: ${rel(ctx.cwd, abs)}`);
        if (statSync(abs).isDirectory()) return fail(`${rel(ctx.cwd, abs)} is a directory; use list_dir`);
        const text = readText(abs);
        if (text.includes("\u0000")) return fail(`${rel(ctx.cwd, abs)} looks binary`);
        const all = text.split("\n");
        if (text.endsWith("\n")) all.pop();
        const start = Math.max(1, num(args.offset) ?? 1);
        const limit = Math.max(1, Math.min(MAX_READ_LINES, num(args.limit) ?? MAX_READ_LINES));
        const slice = all.slice(start - 1, start - 1 + limit);
        const body = slice.map((l, i) => `${String(start + i).padStart(5)}\t${l.length > 2000 ? `${l.slice(0, 2000)}…` : l}`).join("\n");
        const more = start - 1 + slice.length < all.length ? `\n… ${all.length - (start - 1 + slice.length)} more lines (use offset)` : "";
        return { output: truncate(body + more, 60_000), summary: `${rel(ctx.cwd, abs)} · ${slice.length} ${w.lines}` };
      }),
  };

  const listDir: BuiltinTool = {
    name: "list_dir",
    description: "List files and folders in a project directory (folders end with /).",
    parameters: { type: "object", properties: { path: { type: "string", description: "Directory relative to the project root (default .)" } } },
    risk: "read",
    source: "atlas",
    run: (args, ctx) =>
      guard(() => {
        const abs = safePath(ctx.cwd, args.path);
        if (!existsSync(abs) || !statSync(abs).isDirectory()) return fail(`Not a directory: ${rel(ctx.cwd, abs)}`);
        const entries = readdirSync(abs, { withFileTypes: true })
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
          .sort((a, b) => Number(b.endsWith("/")) - Number(a.endsWith("/")) || a.localeCompare(b));
        const shown = entries.slice(0, 500);
        const more = entries.length > shown.length ? `\n… ${entries.length - shown.length} more` : "";
        return { output: (shown.join("\n") || "(empty)") + more, summary: `${rel(ctx.cwd, abs)} · ${entries.length} ${w.entries}` };
      }),
  };

  const search: BuiltinTool = {
    name: "search",
    description: "Search file contents with a regular expression (skips node_modules, .git, dist). Returns path:line: text.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JavaScript regular expression" },
        path: { type: "string", description: "Directory or file to search (default .)" },
        glob: { type: "string", description: 'Only files matching this glob, e.g. "*.ts" or "src/**/*.tsx"' },
      },
      required: ["pattern"],
    },
    risk: "read",
    source: "atlas",
    run: (args, ctx) =>
      guard(() => {
        const pattern = str(args.pattern, "pattern");
        let re: RegExp;
        try {
          re = new RegExp(pattern);
        } catch (err) {
          return fail(`Bad regex: ${(err as Error).message}`);
        }
        const abs = safePath(ctx.cwd, args.path);
        if (!existsSync(abs)) return fail(`Not found: ${rel(ctx.cwd, abs)}`);
        const glob = typeof args.glob === "string" && args.glob ? args.glob : undefined;
        const g = glob ? globToRegExp(glob) : undefined;
        const files = statSync(abs).isDirectory() ? walk(abs, ctx.signal) : [abs][Symbol.iterator]();
        const hits: string[] = [];
        let scanned = 0;
        for (const f of files) {
          if (++scanned > MAX_FILES || hits.length >= MAX_MATCHES) break;
          const r = rel(ctx.cwd, f);
          if (isSecretPath(f)) continue;
          if (g && !g.test(glob!.includes("/") ? r : basename(r))) continue;
          let text: string;
          try {
            if (statSync(f).size > 1_000_000) continue;
            text = readText(f);
          } catch {
            continue;
          }
          if (text.includes("\u0000")) continue;
          const lines = text.split("\n");
          for (let i = 0; i < lines.length && hits.length < MAX_MATCHES; i++) {
            const line = lines[i]!;
            if (re.test(line)) hits.push(`${r}:${i + 1}: ${line.trim().slice(0, 300)}`);
          }
        }
        const capped = hits.length >= MAX_MATCHES ? `\n… stopped at ${MAX_MATCHES} matches; narrow the search` : "";
        return { output: truncate(hits.join("\n") || "No matches") + capped, summary: `${pattern} · ${hits.length} ${w.matches}` };
      }),
  };

  const writeFile: BuiltinTool = {
    name: "write_file",
    description: "Create or overwrite a file with the given content. Prefer edit_file for changes to existing files.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string", description: "Full new file content" } },
      required: ["path", "content"],
    },
    risk: "write",
    source: "atlas",
    preview(args, ctx) {
      try {
        const abs = safePath(ctx.cwd, str(args.path, "path"));
        const before = existsSync(abs) ? readText(abs) : "";
        return previewDiff(rel(ctx.cwd, abs), before, String(args.content ?? ""));
      } catch (err) {
        return (err as Error).message;
      }
    },
    run: (args, ctx) =>
      guard(() => {
        const abs = safePath(ctx.cwd, str(args.path, "path"));
        const content = str(args.content, "content");
        const existed = existsSync(abs);
        if (existed && statSync(abs).isDirectory()) return fail(`${rel(ctx.cwd, abs)} is a directory`);
        const before = existed ? readText(abs) : "";
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf8");
        const d = diffLines(before, content);
        const r = rel(ctx.cwd, abs);
        return {
          output: `${existed ? "Updated" : "Created"} ${r} (${lineCount(content)} lines, +${d.added} -${d.removed})`,
          summary: existed ? `${r} +${d.added} -${d.removed}` : `${r} · ${w.created} · ${lineCount(content)} ${w.lines}`,
        };
      }),
  };

  const editFile: BuiltinTool = {
    name: "edit_file",
    description:
      "Replace an exact string in a file. old_string must match exactly once (include surrounding lines to make it unique) unless replace_all is true. Read the file first.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string", description: "Exact text to replace" },
        new_string: { type: "string", description: "Replacement text" },
        replace_all: { type: "boolean", description: "Replace every occurrence" },
      },
      required: ["path", "old_string", "new_string"],
    },
    risk: "write",
    source: "atlas",
    preview(args, ctx) {
      try {
        const abs = safePath(ctx.cwd, str(args.path, "path"));
        const before = existsSync(abs) ? readText(abs) : "";
        const r = editResult(before, String(args.old_string ?? ""), String(args.new_string ?? ""), args.replace_all === true);
        if ("error" in r) return `${rel(ctx.cwd, abs)}: ${r.error}`;
        return previewDiff(rel(ctx.cwd, abs), before, r.next);
      } catch (err) {
        return (err as Error).message;
      }
    },
    run: (args, ctx) =>
      guard(() => {
        const abs = safePath(ctx.cwd, str(args.path, "path"));
        const r = rel(ctx.cwd, abs);
        if (!existsSync(abs)) return fail(`File not found: ${r}`);
        const before = readText(abs);
        const res = editResult(before, str(args.old_string, "old_string"), str(args.new_string, "new_string"), args.replace_all === true);
        if ("error" in res) return fail(`${r}: ${res.error}`);
        writeFileSync(abs, res.next, "utf8");
        const d = diffLines(before, res.next);
        return { output: `Edited ${r} (+${d.added} -${d.removed})`, summary: `${r} +${d.added} -${d.removed}` };
      }),
  };

  const runCommand: BuiltinTool = {
    name: "run_command",
    description: `Run a shell command in the project folder (${process.platform === "win32" ? "Windows PowerShell 5.1: no && or ||, use ;" : "bash"}). Returns exit code and output. Do not start servers or interactive programs.`,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout_ms: { type: "number", description: "Kill after this many ms (default 120000, max 600000)" },
      },
      required: ["command"],
    },
    risk: "write",
    source: "atlas",
    preview: (args) => commandLine(String(args.command ?? "")),
    run: (args, ctx) =>
      guard(async () => {
        const command = str(args.command, "command");
        const timeout = Math.min(600_000, Math.max(1000, num(args.timeout_ms) ?? 120_000));
        const r = await runShell(command, ctx.cwd, timeout, ctx.signal);
        const short = command.length > 60 ? `${command.slice(0, 59)}…` : command;
        const status = r.timedOut ? w.timedOut : `${w.exit} ${r.code ?? "?"}`;
        const head = r.timedOut ? `Timed out after ${timeout} ms (killed)` : r.aborted ? "Aborted by the user" : `Exit code: ${r.code ?? "unknown"}`;
        return { output: `${head}\n${r.output || "(no output)"}`, isError: r.timedOut || r.aborted || r.code !== 0, summary: `${short} · ${status}` };
      }),
  };

  return [readFile, listDir, search, writeFile, editFile, runCommand];
}
