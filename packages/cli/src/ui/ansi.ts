import { bold, hexToRgb, paint } from "./term.js";
import { C, TAG_COLOR, tagText, type Tag } from "./theme.js";

/** Colour that degrades truecolor → 256 → 16 → none per terminal (see term.ts). */
function hex(color: string) {
  const rgb = hexToRgb(color);
  return (s: string) => paint(rgb, s);
}

/** Colour helpers for plain (non-Ink) output, same palette as the TUI. */
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
  bold: (s: string) => bold(s),
  tag: (t: Tag) => hex(TAG_COLOR[t])(tagText(t)),
};
