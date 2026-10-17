/** Atlas neon-blue palette — shared by CLI (and mirrored by the website). */
export const C = {
  neon: "#00E5FF",
  glow: "#7DF9FF",
  blue: "#2F7BFF",
  deep: "#3D5AFE",
  text: "#E6F7FF",
  dim: "#6B87A8",
  faint: "#3A4E66",
  ok: "#3DFFA2",
  warn: "#FFD166",
  err: "#FF5C7A",
  user: "#B8C7DB",
  violet: "#A78BFA",
} as const;

export const GRADIENT = ["#7DF9FF", "#00E5FF", "#00B8FF", "#2F7BFF", "#3D5AFE"];

/** Claude-style "thinking" glyph cycle. */
export const SPARK = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

/**
 * Monochrome, text-presentation glyphs only (no emoji): they render the same
 * in Windows Terminal, conhost, macOS and Linux fonts.
 */
export const I = {
  reply: "●",
  on: "●",
  off: "○",
  ok: "✔",
  fail: "✗",
  warn: "!",
  pointer: "›",
  prompt: "›",
  brand: "◆",
  star: "✦",
  sub: "⎿",
  swap: "⇄",
  arrow: "→",
  last: "↺",
} as const;

export type Tag = "free" | "key" | "login" | "paid" | "local" | "auto";

export const TAG_COLOR: Record<Tag, string> = {
  free: C.ok,
  key: C.warn,
  login: C.blue,
  paid: C.violet,
  local: C.glow,
  auto: C.neon,
};

/** Fixed-width tag so list columns stay aligned. */
export const tagText = (t: Tag) => t.padEnd(5);

/** Strips emoji (and their variation selectors / ZWJ) from catalog text. */
export function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍️︎⃣]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
