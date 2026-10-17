import { GRADIENT } from "./theme.js";

// ANSI-Shadow letters, kept separate so the logo can be "typed" one letter at a time.
const A = [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"];
const T = ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "];
const L = ["██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝"];
const S = ["███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝"];
export const LETTERS = [A, T, L, A, S];
const ROWS = 6;
const WIDTH = LETTERS.reduce((w, l) => w + l[0]!.length, 0);

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Horizontal neon gradient color for column x. */
function colorAt(x: number): string {
  const t = (x / Math.max(1, WIDTH - 1)) * (GRADIENT.length - 1);
  const i = Math.min(GRADIENT.length - 2, Math.floor(t));
  const f = t - i;
  const [r1, g1, b1] = rgb(GRADIENT[i]!);
  const [r2, g2, b2] = rgb(GRADIENT[i + 1]!);
  return `${Math.round(r1 + (r2 - r1) * f)};${Math.round(g1 + (g2 - g1) * f)};${Math.round(b1 + (b2 - b1) * f)}`;
}

/** Logo rows with the first `count` letters visible. */
export function logoRows(count: number, color = true): string[] {
  const shown = LETTERS.slice(0, count);
  return Array.from({ length: ROWS }, (_, r) => {
    const line = shown.map((l) => l[r]).join("");
    if (!color) return line;
    let out = "";
    for (let x = 0; x < line.length; x++) {
      const ch = line[x]!;
      out += ch === " " ? " " : `\x1b[38;2;${colorAt(x)}m${ch}`;
    }
    return `${out}\x1b[39m`;
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Prints ATLAS letter by letter (typewriter), then leaves it on screen.
 * Static (no animation) when output is not a terminal or ATLAS_NO_ANIM is set.
 */
export async function printLogo(): Promise<void> {
  const out = process.stdout;
  const color = !process.env.NO_COLOR && out.isTTY;
  const narrow = (out.columns ?? 80) < WIDTH + 4;
  if (narrow) {
    out.write(`\n  ${color ? `\x1b[38;2;${colorAt(0)}m` : ""}◆ A T L A S${color ? "\x1b[39m" : ""}\n`);
    return;
  }
  const pad = "  ";
  out.write("\n");
  if (!out.isTTY || process.env.ATLAS_NO_ANIM) {
    out.write(logoRows(5, !!color).map((r) => pad + r).join("\n") + "\n\n");
    return;
  }
  out.write("\x1b[?25l"); // hide cursor while typing
  try {
    for (let n = 1; n <= LETTERS.length; n++) {
      const caret = n < LETTERS.length ? "\x1b[38;2;125;249;255m▌\x1b[39m" : "";
      const rows = logoRows(n, !!color).map((r, i) => pad + r + (i === ROWS - 2 ? caret : "") + "\x1b[K");
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
