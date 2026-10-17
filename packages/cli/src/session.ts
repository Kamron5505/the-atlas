import { atlasHome, messageText, type ChatMessage } from "@the-atlas/core";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Session {
  id: string;
  title: string;
  cwd: string;
  created: string;
  updated: string;
  provider: string;
  model?: string;
  messages: ChatMessage[];
  /** Per-answer metadata, aligned with assistant messages. */
  meta: string[];
}

const dir = () => join(atlasHome(), "sessions");

export function newSession(cwd: string, provider: string, model?: string): Session {
  const now = new Date().toISOString();
  const id = `${now.slice(0, 10)}-${randomBytes(3).toString("hex")}`;
  return { id, title: "", cwd, created: now, updated: now, provider, model, messages: [], meta: [] };
}

/** First user line, trimmed — used as the chat title in /history. */
export function titleOf(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  // Attached @files are appended after a blank line as <file>/<dir> blocks — not part of the title.
  const raw = first ? messageText(first).split(/\n\n<(?:file|dir) /)[0]! : "";
  const text = raw.replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** Atomic save; empty chats are not written. */
export function saveSession(s: Session): void {
  if (!s.messages.some((m) => m.role === "user")) return;
  // Chats may hold pasted secrets and attached files: owner-only on POSIX.
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  s.updated = new Date().toISOString();
  s.title ||= titleOf(s.messages);
  const file = join(dir(), `${s.id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(s), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

export function loadSession(id: string): Session | undefined {
  const file = join(dir(), `${id}.json`);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Session;
  } catch {
    return undefined;
  }
}

export interface SessionInfo {
  id: string;
  title: string;
  cwd: string;
  updated: string;
  model: string;
  turns: number;
}

/** Newest first. Reads only what the list needs. */
export function listSessions(limit = 50): SessionInfo[] {
  if (!existsSync(dir())) return [];
  const out: SessionInfo[] = [];
  for (const f of readdirSync(dir())) {
    if (!f.endsWith(".json")) continue;
    const s = loadSession(f.slice(0, -5));
    if (!s) continue;
    out.push({
      id: s.id,
      title: s.title || titleOf(s.messages),
      cwd: s.cwd,
      updated: s.updated,
      model: s.provider === "auto" ? "auto" : `${s.provider}${s.model ? `/${s.model}` : ""}`,
      turns: s.messages.filter((m) => m.role === "user").length,
    });
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, limit);
}

/** Most recent chat in this folder (for `atlas -c` / `/resume`). */
export function lastSession(cwd: string): Session | undefined {
  const hit = listSessions(200).find((s) => s.cwd.toLowerCase() === cwd.toLowerCase());
  return hit ? loadSession(hit.id) : undefined;
}

/** Markdown transcript. */
export function toMarkdown(s: Session): string {
  const lines = [`# ${s.title || titleOf(s.messages) || "Atlas chat"}`, "", `_${s.created.slice(0, 16).replace("T", " ")} · ${s.cwd}_`, ""];
  let a = 0;
  for (const m of s.messages) {
    if (m.role === "system") continue;
    if (m.role === "user") lines.push(`## › ${messageText(m).split("\n")[0]!.slice(0, 80)}`, "", messageText(m), "");
    else lines.push(`**Atlas** · ${s.meta[a++] ?? ""}`, "", messageText(m), "", "---", "");
  }
  return lines.join("\n");
}

/** "5 min", "2 h", "3 d" — compact relative time for lists. */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}
