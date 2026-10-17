/**
 * ANSI (SGR) → styled runs / HTML, for the recorded Atlas CLI demos.
 * Supports 16 / 256 / truecolor fg+bg, bold, dim, italic, underline, inverse,
 * strikethrough and resets. Other escape sequences are dropped.
 */

export interface Run {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

/** Terminal defaults: what inverse swaps in when no colour is set. */
export const TERM_FG = "#e6f7ff";
export const TERM_BG = "#070c16";

/** 16-colour palette tuned for the Atlas dark background. */
export const PALETTE16 = [
  "#0b1424", "#ff5c7a", "#3dffa2", "#ffd166", "#2f7bff", "#a78bfa", "#00e5ff", "#cfe3f2",
  "#6b87a8", "#ff8098", "#7dffc0", "#ffe08f", "#5c9bff", "#c4b1ff", "#7df9ff", "#ffffff",
];

const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const rgb = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** xterm 256-colour index → hex. */
export function color256(n: number): string {
  if (n < 16) return PALETTE16[n]!;
  if (n < 232) {
    const i = n - 16;
    const v = (x: number) => (x === 0 ? 0 : 55 + x * 40);
    return rgb(v(Math.floor(i / 36)), v(Math.floor(i / 6) % 6), v(i % 6));
  }
  const g = 8 + (n - 232) * 10;
  return rgb(g, g, g);
}

interface State {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strike?: boolean;
}

function applySgr(s: State, params: number[]): State {
  const n = { ...s };
  if (!params.length) params = [0];
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!;
    if (p === 0) {
      for (const k of Object.keys(n) as (keyof State)[]) delete n[k];
    } else if (p === 1) n.bold = true;
    else if (p === 2) n.dim = true;
    else if (p === 3) n.italic = true;
    else if (p === 4) n.underline = true;
    else if (p === 7) n.inverse = true;
    else if (p === 9) n.strike = true;
    else if (p === 22) n.bold = n.dim = false;
    else if (p === 23) n.italic = false;
    else if (p === 24) n.underline = false;
    else if (p === 27) n.inverse = false;
    else if (p === 29) n.strike = false;
    else if (p >= 30 && p <= 37) n.fg = PALETTE16[p - 30];
    else if (p >= 90 && p <= 97) n.fg = PALETTE16[p - 90 + 8];
    else if (p === 39) n.fg = undefined;
    else if (p >= 40 && p <= 47) n.bg = PALETTE16[p - 40];
    else if (p >= 100 && p <= 107) n.bg = PALETTE16[p - 100 + 8];
    else if (p === 49) n.bg = undefined;
    else if (p === 38 || p === 48) {
      const mode = params[i + 1];
      let c: string | undefined;
      if (mode === 5) {
        c = color256(params[i + 2] ?? 0);
        i += 2;
      } else if (mode === 2) {
        c = rgb(params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0);
        i += 4;
      }
      if (p === 38) n.fg = c;
      else n.bg = c;
    }
  }
  return n;
}

const SEQ = /\x1b\[([0-9;:?]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>]|[\x00-\x08\x0b-\x1f\x7f]/g;

/** One line of ANSI text → styled runs (adjacent runs with equal style merged). */
export function ansiRuns(line: string): Run[] {
  const runs: Run[] = [];
  let st: State = {};
  let last = 0;
  const emit = (text: string) => {
    if (!text) return;
    let fg = st.fg;
    let bg = st.bg;
    if (st.inverse) [fg, bg] = [bg ?? TERM_BG, fg ?? TERM_FG];
    const run: Run = { text, fg, bg, bold: st.bold || undefined, dim: st.dim || undefined, italic: st.italic || undefined, underline: st.underline || undefined, strike: st.strike || undefined };
    const prev = runs[runs.length - 1];
    if (prev && sameStyle(prev, run)) prev.text += text;
    else runs.push(run);
  };
  for (const m of line.matchAll(SEQ)) {
    emit(line.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[2] === "m") st = applySgr(st, (m[1] ?? "").split(/[;:]/).filter((x) => x !== "").map(Number));
  }
  emit(line.slice(last));
  return runs;
}

function sameStyle(a: Run, b: Run): boolean {
  return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.dim === b.dim && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * One line of ANSI text → HTML spans (classes b/d/i/u/s, inline colours).
 * Runs of █ become filled cells (class "blk"), so block letters have no seams
 * whatever the font or line height.
 */
export function ansiToHtml(line: string): string {
  return ansiRuns(line)
    .flatMap((r) => r.text.split(/(█+)/).filter(Boolean).map((text) => ({ ...r, text })))
    .map((r) => {
      if (r.text[0] === "█") return `<span class="blk" style="background:${r.fg ?? TERM_FG}">${" ".repeat(r.text.length)}</span>`;
      const text = escapeHtml(r.text);
      const cls = [r.bold && "b", r.dim && "d", r.italic && "i", r.underline && "u", r.strike && "s"].filter(Boolean).join(" ");
      const style = [r.fg && `color:${r.fg}`, r.bg && `background:${r.bg}`].filter(Boolean).join(";");
      if (!cls && !style) return text;
      return `<span${cls ? ` class="${cls}"` : ""}${style ? ` style="${style}"` : ""}>${text}</span>`;
    })
    .join("");
}

/** Visible text of an ANSI string. */
export const stripAnsi = (s: string) => s.replace(SEQ, "");
