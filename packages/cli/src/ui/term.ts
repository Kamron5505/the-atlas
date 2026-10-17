/**
 * Terminal capabilities, so Atlas looks right everywhere: Windows Terminal,
 * legacy conhost/cmd, Windows PowerShell 5.1, PowerShell 7, VS Code,
 * macOS Terminal.app (no truecolor), iTerm2, WezTerm, Linux consoles, CI logs.
 *
 * Overrides: NO_COLOR, FORCE_COLOR=0..3, ATLAS_ASCII=1 (plain glyphs),
 * ATLAS_UNICODE=1 (trust the font).
 */

export type ColorDepth = 1 | 4 | 8 | 24;

const set = (v: string | undefined) => v !== undefined && v !== "";

/** FORCE_COLOR as a depth, or undefined when not forced. */
function forcedDepth(): ColorDepth | undefined {
  const f = process.env.FORCE_COLOR;
  if (f === undefined) return undefined;
  if (f === "0" || f === "false") return 1;
  if (f === "2") return 8;
  if (f === "3") return 24;
  return 4; // "", "1", "true"
}

/** Truecolor-capable terminals that announce themselves via env. */
function knownTruecolor(): boolean {
  const e = process.env;
  const tp = e.TERM_PROGRAM;
  return (
    e.COLORTERM === "truecolor" ||
    e.COLORTERM === "24bit" ||
    set(e.WT_SESSION) ||
    set(e.WEZTERM_PANE) ||
    tp === "vscode" ||
    tp === "iTerm.app" ||
    tp === "WezTerm" ||
    tp === "ghostty"
  );
}

/** Colors the terminal can show. NO_COLOR / FORCE_COLOR / TERM=dumb / non-TTY are honoured. */
export function colorDepth(stream: Stream = process.stdout): ColorDepth {
  const e = process.env;
  if (set(e.NO_COLOR)) return 1;
  const forced = forcedDepth();
  if (forced !== undefined) return forced;
  if (!stream.isTTY) return 1;
  if (e.TERM === "dumb") return 1;
  if (e.TERM_PROGRAM === "Apple_Terminal") return 8; // Terminal.app: 256 colours, no truecolor
  if (knownTruecolor()) return 24;
  if (e.TERM === "linux") return 4;
  if (/-256(color)?$/.test(e.TERM ?? "")) return 8;
  const d = typeof stream.getColorDepth === "function" ? stream.getColorDepth() : 4;
  return d >= 24 ? 24 : d >= 8 ? 8 : d >= 4 ? 4 : 1;
}

type Stream = { isTTY?: boolean; getColorDepth?: () => number };

/**
 * Can the terminal font draw ✔ › ◆ ⎿ and similar (not emoji)?
 * Piped output (file, CI log, Claude Code status line) is plain UTF-8: true.
 */
export function unicodeSupported(stream: Stream = process.stdout): boolean {
  const e = process.env;
  if (set(e.ATLAS_ASCII)) return false;
  if (set(e.ATLAS_UNICODE)) return true;
  if (!stream.isTTY) return true;
  if (e.TERM === "linux" || e.TERM === "dumb") return false;
  if (process.platform !== "win32") return true;
  // Windows: legacy conhost (cmd, Windows PowerShell 5.1 window) lacks these glyphs.
  return Boolean(
    set(e.WT_SESSION) ||
      set(e.WEZTERM_PANE) ||
      set(e.TERM_PROGRAM) ||
      set(e.TERMINUS_SUBLIME) ||
      e.ConEmuTask === "{cmd::Cmder}" ||
      e.TERM === "xterm-256color" ||
      e.TERM === "alacritty" ||
      e.TERMINAL_EMULATOR === "JetBrains-JediTerm",
  );
}

/** Color emoji (🌿 🤖 🟢) — legacy Windows consoles and the Linux VT can't. */
export function emojiSupported(stream: Stream = process.stdout): boolean {
  if (!unicodeSupported(stream)) return false;
  if (!stream.isTTY) return true;
  const e = process.env;
  if (process.platform === "win32") return Boolean(set(e.WT_SESSION) || e.TERM_PROGRAM === "vscode" || set(e.WEZTERM_PANE));
  return true;
}

/**
 * Depth for output another program renders (Claude Code's status line reads
 * our stdout through a pipe): truecolor unless env says otherwise.
 */
export function pipedColorDepth(): ColorDepth {
  const e = process.env;
  if (set(e.NO_COLOR) || e.FORCE_COLOR === "0" || e.FORCE_COLOR === "false" || e.TERM === "dumb") return 1;
  if (e.TERM_PROGRAM === "Apple_Terminal") return 8;
  if (e.TERM === "linux") return 4;
  return 24;
}

/** Best-guess name of the terminal, for `atlas doctor`. */
export function terminalName(): string {
  const e = process.env;
  if (set(e.WT_SESSION)) return "Windows Terminal";
  if (e.TERM_PROGRAM === "vscode") return "VS Code";
  if (e.TERM_PROGRAM === "Apple_Terminal") return "macOS Terminal";
  if (e.TERM_PROGRAM === "iTerm.app") return "iTerm2";
  if (set(e.WEZTERM_PANE) || e.TERM_PROGRAM === "WezTerm") return "WezTerm";
  if (set(e.TERM_PROGRAM)) return e.TERM_PROGRAM!;
  if (e.TERM === "linux") return "Linux console";
  if (process.platform === "win32") return set(e.TERM) ? `Windows (${e.TERM})` : "legacy Windows console (conhost)";
  return e.TERM || "unknown";
}

/** True for the old Windows console host (cmd / PowerShell 5.1 window without Windows Terminal). */
export function legacyConhost(): boolean {
  return process.platform === "win32" && terminalName() === "legacy Windows console (conhost)";
}

// xterm 256-colour cube helpers.
const CUBE = [0, 95, 135, 175, 215, 255];
const nearest = (v: number) => CUBE.reduce((best, c, i) => (Math.abs(c - v) < Math.abs(CUBE[best]! - v) ? i : best), 0);

/** Nearest xterm-256 palette index for an RGB colour. */
export function ansi256(r: number, g: number, b: number): number {
  if (Math.max(r, g, b) - Math.min(r, g, b) < 10) {
    const gray = Math.round((r + g + b) / 3);
    if (gray < 8) return 16;
    if (gray > 238) return 231;
    return 232 + Math.round(((gray - 8) / 247) * 23);
  }
  return 16 + 36 * nearest(r) + 6 * nearest(g) + nearest(b);
}

const BASIC: [number, number, number, number][] = [
  [30, 0, 0, 0], [31, 205, 49, 49], [32, 13, 188, 121], [33, 229, 229, 16], [34, 36, 114, 200], [35, 188, 63, 188], [36, 17, 168, 205], [37, 229, 229, 229],
  [90, 102, 102, 102], [91, 241, 76, 76], [92, 35, 209, 139], [93, 245, 245, 67], [94, 59, 142, 234], [95, 214, 112, 214], [96, 41, 184, 219], [97, 255, 255, 255],
];

/** Nearest of the 16 basic ANSI foreground codes (30–37, 90–97). */
export function ansi16(r: number, g: number, b: number): number {
  let best = BASIC[0]!;
  let dist = Infinity;
  for (const c of BASIC) {
    const d = (c[1] - r) ** 2 + (c[2] - g) ** 2 + (c[3] - b) ** 2;
    if (d < dist) [best, dist] = [c, d];
  }
  return best[0];
}

/** Foreground escape for an RGB colour at the given depth ("" when colour is off). */
export function fgCode(r: number, g: number, b: number, depth: ColorDepth = colorDepth()): string {
  if (depth === 24) return `\x1b[38;2;${r};${g};${b}m`;
  if (depth === 8) return `\x1b[38;5;${ansi256(r, g, b)}m`;
  if (depth === 4) return `\x1b[${ansi16(r, g, b)}m`;
  return "";
}

/** Wraps text in an RGB colour that degrades to 256 / 16 colours or none. */
export function paint(rgb: readonly [number, number, number], s: string, depth: ColorDepth = colorDepth()): string {
  const code = fgCode(rgb[0], rgb[1], rgb[2], depth);
  return code ? `${code}${s}\x1b[39m` : s;
}

/** Bold, only when colour/styling is on. */
export function bold(s: string, depth: ColorDepth = colorDepth()): string {
  return depth > 1 ? `\x1b[1m${s}\x1b[22m` : s;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
