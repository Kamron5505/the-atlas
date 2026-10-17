import { colorDepth, fgCode, hexToRgb, paint, unicodeSupported, type ColorDepth } from "./term.js";
import { C, GRADIENT, I } from "./theme.js";

// ANSI-Shadow letters, kept separate so the logo can be "typed" one letter at a time.
const A = [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"];
const T = ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "];
const L = ["██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝"];
const S = ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"];
export const LETTERS = [A, T, L, A, S];
const ROWS = 6;
const WIDTH = LETTERS.reduce((w, l) => w + l[0]!.length, 0);
const PAD = "  ";

/** Horizontal neon gradient colour for column x. */
function colorAt(x: number): [number, number, number] {
  const t = (x / Math.max(1, WIDTH - 1)) * (GRADIENT.length - 1);
  const i = Math.min(GRADIENT.length - 2, Math.floor(t));
  const f = t - i;
  const [r1, g1, b1] = hexToRgb(GRADIENT[i]!);
  const [r2, g2, b2] = hexToRgb(GRADIENT[i + 1]!);
  return [Math.round(r1 + (r2 - r1) * f), Math.round(g1 + (g2 - g1) * f), Math.round(b1 + (b2 - b1) * f)];
}

/**
 * Logo rows with the first `count` letters visible. `color` may be a depth;
 * `true` means detect. Escapes are emitted only when the colour changes, so
 * 256/16-colour terminals get the same gradient in fewer bands.
 */
export function logoRows(count: number, color: boolean | ColorDepth = true): string[] {
  const depth: ColorDepth = color === true ? colorDepth() : color === false ? 1 : color;
  const shown = LETTERS.slice(0, count);
  return Array.from({ length: ROWS }, (_, r) => {
    const line = shown.map((l) => l[r]).join("");
    if (depth === 1) return line;
    let out = "";
    let last = "";
    for (let x = 0; x < line.length; x++) {
      const ch = line[x]!;
      if (ch !== " ") {
        const code = fgCode(...colorAt(x), depth);
        if (code !== last) out += last = code;
      }
      out += ch;
    }
    return `${out}\x1b[39m`;
  });
}

/** One-line logo for narrow or non-Unicode terminals: "# A T L A S". */
export function compactLogo(depth: ColorDepth = colorDepth()): string {
  return paint(colorAt(0), `${I.brand} A T L A S`, depth);
}

/**
 * Should the block-letter logo be drawn? Needs the width, and a font with block
 * glyphs: CP437 consoles (legacy conhost) have them, a bare Linux VT / ASCII mode don't.
 */
export function useBlockLogo(columns = process.stdout.columns ?? 80): boolean {
  if (columns < WIDTH + PAD.length + 2) return false;
  if (process.env.ATLAS_ASCII) return false;
  return unicodeSupported() || process.platform === "win32";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wipes what Atlas printed when it exits (screen + scrollback, like `cls`) and
 * restores the cursor. ATLAS_KEEP_SCREEN=1 keeps the transcript instead.
 */
export function clearOnExit(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(process.env.ATLAS_KEEP_SCREEN ? "\x1b[?25h" : "\x1b[?25h\x1b[2J\x1b[3J\x1b[H");
}

/**
 * Prints ATLAS letter by letter (typewriter), then leaves it on screen with one
 * empty line above and below. Static when output is not a terminal or
 * ATLAS_NO_ANIM is set; a single compact line when the terminal is narrow.
 */
export async function printLogo(): Promise<void> {
  const out = process.stdout;
  const depth = colorDepth(out);
  // "\r" first: some hosts leave the cursor mid-line after the prompt echo.
  out.write("\r\n");
  if (!useBlockLogo(out.columns ?? 80)) {
    out.write(`${PAD}${compactLogo(depth)}\n\n`);
    return;
  }
  if (!out.isTTY || process.env.ATLAS_NO_ANIM) {
    out.write(logoRows(5, depth).map((r) => PAD + r).join("\n") + "\n\n");
    return;
  }
  out.write("\x1b[?25l"); // hide cursor while typing
  try {
    for (let n = 1; n <= LETTERS.length; n++) {
      const caret = n < LETTERS.length ? paint(hexToRgb(C.glow), "▌", depth) : "";
      const rows = logoRows(n, depth).map((r, i) => PAD + r + (i === ROWS - 2 ? caret : "") + "\x1b[K");
      out.write(rows.join("\n") + "\n");
      if (n < LETTERS.length) {
        await sleep(110);
        out.write(`\x1b[${ROWS}A`);
      }
    }
    out.write("\n");
  } finally {
    out.write("\x1b[?25h");
  }
}
