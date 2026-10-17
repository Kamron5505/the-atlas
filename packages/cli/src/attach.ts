import type { ContentPart } from "@the-atlas/core";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";

const MAX_TEXT = 256 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", ".venv", "venv"]);

export interface Attached {
  path: string;
  kind: "text" | "image" | "dir";
  lines?: number;
  bytes: number;
}

export interface Prepared {
  content: string | ContentPart[];
  attached: Attached[];
  /** Mentions that could not be attached, with the reason. */
  skipped: { path: string; reason: string }[];
}

const MENTION = /(^|\s)@("[^"]+"|[^\s"]+)/g;

export function mentions(text: string): string[] {
  return [...text.matchAll(MENTION)].map((m) => m[2]!.replace(/^"|"$/g, ""));
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

function listing(abs: string, rel: string): string {
  const names = readdirSync(abs, { withFileTypes: true })
    .filter((d) => !SKIP_DIRS.has(d.name))
    .slice(0, 200)
    .map((d) => (d.isDirectory() ? `${d.name}/` : d.name));
  return `<dir path="${rel}">\n${names.join("\n")}\n</dir>`;
}

/** Turns "@src/app.ts why?" into the message content with the file inlined (images as data URLs). */
export function prepareMessage(text: string, cwd: string): Prepared {
  const attached: Attached[] = [];
  const skipped: Prepared["skipped"] = [];
  const blocks: string[] = [];
  const images: ContentPart[] = [];
  const seen = new Set<string>();

  for (const ref of mentions(text)) {
    const abs = resolve(cwd, ref);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!existsSync(abs)) {
      skipped.push({ path: ref, reason: "not found" });
      continue;
    }
    const st = statSync(abs);
    const rel = relative(cwd, abs).split(sep).join("/") || basename(abs);
    if (st.isDirectory()) {
      blocks.push(listing(abs, rel));
      attached.push({ path: rel, kind: "dir", bytes: 0 });
      continue;
    }
    const mime = IMAGE_MIME[extname(abs).toLowerCase()];
    if (mime) {
      if (st.size > MAX_IMAGE) {
        skipped.push({ path: rel, reason: "image > 5 MB" });
        continue;
      }
      images.push({ type: "image_url", image_url: { url: `data:${mime};base64,${readFileSync(abs).toString("base64")}` } });
      attached.push({ path: rel, kind: "image", bytes: st.size });
      continue;
    }
    if (st.size > MAX_TEXT) {
      skipped.push({ path: rel, reason: "file > 256 KB" });
      continue;
    }
    const buf = readFileSync(abs);
    if (isBinary(buf)) {
      skipped.push({ path: rel, reason: "binary file" });
      continue;
    }
    const body = buf.toString("utf8");
    const lang = extname(abs).slice(1);
    blocks.push(`<file path="${rel}">\n\`\`\`${lang}\n${body}${body.endsWith("\n") ? "" : "\n"}\`\`\`\n</file>`);
    attached.push({ path: rel, kind: "text", lines: body.split("\n").length, bytes: st.size });
  }

  const full = blocks.length ? `${text}\n\n${blocks.join("\n\n")}` : text;
  const content: Prepared["content"] = images.length ? [{ type: "text", text: full }, ...images] : full;
  return { content, attached, skipped };
}

/** The "@partial" being typed at the end of the input, if any. */
export function activeMention(input: string): string | undefined {
  const m = /(?:^|\s)@([^\s"]*)$/.exec(input);
  return m ? m[1] : undefined;
}

/** Up to `limit` paths matching a partial mention ("src/ap" → "src/app.ts"). Dirs end with "/". */
export function completePath(partial: string, cwd: string, limit = 8): string[] {
  const norm = partial.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  const base = slash >= 0 ? norm.slice(0, slash + 1) : "";
  const prefix = (slash >= 0 ? norm.slice(slash + 1) : norm).toLowerCase();
  const dir = resolve(cwd, base || ".");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => !SKIP_DIRS.has(d.name) && (prefix.startsWith(".") || !d.name.startsWith(".")))
      .filter((d) => d.name.toLowerCase().startsWith(prefix))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((d) => `${base}${d.name}${d.isDirectory() ? "/" : ""}`);
  } catch {
    return [];
  }
}

/** Replaces the trailing "@partial" with "@completion". */
export function applyCompletion(input: string, completion: string): string {
  return input.replace(/@[^\s"]*$/, `@${completion}`);
}

