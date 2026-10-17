import { C, TAG_COLOR, tagText, type Tag } from "./theme.js";

const enabled = !process.env.NO_COLOR && process.stdout.isTTY !== false;

function hex(color: string) {
  const n = Number.parseInt(color.slice(1), 16);
  return (s: string) => (enabled ? `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${s}\x1b[39m` : s);
}

/** Truecolor helpers for plain (non-Ink) output, same palette as the TUI. */
export const a = {
  neon: hex(C.neon),
  glow: hex(C.glow),
  blue: hex(C.blue),
  text: hex(C.text),
  dim: hex(C.dim),
  faint: hex(C.faint),
  ok: hex(C.ok),
  warn: hex(C.warn),
  err: hex(C.err),
  bold: (s: string) => (enabled ? `\x1b[1m${s}\x1b[22m` : s),
  tag: (t: Tag) => hex(TAG_COLOR[t])(tagText(t)),
};
