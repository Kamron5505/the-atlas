/**
 * Records the real Atlas CLI UI (Ink components) as timed ANSI frames for the
 * website's terminal demos, once per site language (uz, ru, en):
 * apps/site/src/demos/<name>.<lang>.json = {cols, rows, lines, frames:[[t, ...lineIndexes]]}.
 * Language-neutral demos (logo) are written once as <name>.json.
 *
 * Offline and side-effect free: fetch is mocked (scripted SSE answers), the
 * browser opener is faked, HOME / ATLAS_HOME / PATH point at a temp sandbox.
 *
 *   npx tsx --tsconfig packages/cli/tsconfig.json packages/cli/scripts/capture-demos.tsx [logo chat chat.ru ...]
 */
import { execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = join(ROOT, "apps/site/src/demos");
const COLS = 100;
const MAX_ROWS = 28;

// ---------------------------------------------------------------- sandbox env
// Must happen before ink/chalk are imported (they read env at load time).
const gitDir = (() => {
  try {
    const out = execSync(process.platform === "win32" ? "where git" : "command -v git", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return dirname(out.split(/\r?\n/)[0]!.trim());
  } catch {
    return undefined;
  }
})();
const SANDBOX = mkdtempSync(join(tmpdir(), "atlas-demo-"));
const HOME = join(SANDBOX, "home");
const BIN = join(SANDBOX, "bin");
const PROJECT = join(SANDBOX, "work", "my-app");
for (const d of [HOME, BIN, join(PROJECT, "src")]) mkdirSync(d, { recursive: true });

Object.assign(process.env, {
  FORCE_COLOR: "3",
  ATLAS_UNICODE: "1",
  ATLAS_HOME: join(HOME, ".the-atlas"),
  HOME,
  USERPROFILE: HOME,
  APPDATA: join(HOME, "AppData", "Roaming"),
  LOCALAPPDATA: join(HOME, "AppData", "Local"),
  XDG_CONFIG_HOME: join(HOME, ".config"),
  CLAUDE_CONFIG_DIR: join(HOME, ".claude"),
  PATH: [BIN, gitDir].filter(Boolean).join(delimiter),
  GIT_CONFIG_NOSYSTEM: "1",
});
for (const k of Object.keys(process.env)) {
  if (k === "CI" || k.startsWith("CI_") || k === "CONTINUOUS_INTEGRATION" || k === "NO_COLOR" || k === "WT_SESSION" || k === "ATLAS_ASCII" || k.startsWith("OPENROUTER") || k.endsWith("_API_KEY")) {
    delete process.env[k];
  }
}
// Looks like an interactive terminal; on Windows that also means text status markers instead of emoji.
Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

// A few "installed" agents for the agents menu (empty shims, never executed).
for (const b of ["claude", "gemini", "codex", "qwen"]) {
  writeFileSync(join(BIN, b), "");
  writeFileSync(join(BIN, `${b}.cmd`), "");
}

// Demo project: a tiny git repo so the status line shows repo, branch and +/- lines.
type Lang = "uz" | "ru" | "en";
const LANGS: Lang[] = ["uz", "ru", "en"];
const HELLO: Record<Lang, string> = { uz: "Salom", ru: "Привет", en: "Hello" };
const git = (args: string) =>
  execSync(`git -c user.name=atlas -c user.email=demo@example.invalid -c commit.gpgsign=false ${args}`, { cwd: PROJECT, stdio: "ignore" });
/** Clean demo project in the given language (the agent demo edits greet.js). */
function resetProject(lang: Lang) {
  writeFileSync(join(PROJECT, "src", "greet.js"), "export function greet(name) {\n  return `" + HELLO[lang] + ", ${name}!`;\n}\n");
  try {
    git("add -A");
    git("commit -q --allow-empty -m reset");
  } catch {
    // no git: the status line shows just the folder name
  }
}
writeFileSync(join(PROJECT, "README.md"), "# my-app\n");
try {
  git("init -q -b main");
} catch {
  // no git
}
resetProject("uz");
process.chdir(PROJECT);

// ------------------------------------------------------------ fake browser
// openUrl() spawns the OS opener; here it "visits" the OAuth URL and follows the callback.
const realFetch = globalThis.fetch;
const cp = createRequire(import.meta.url)("node:child_process") as typeof import("node:child_process");
cp.spawn = ((_cmd: string, args: readonly string[] = []) => {
  const url = args.find((a) => a.startsWith("https://openrouter.ai/auth"));
  if (url) {
    const u = new URL(url);
    const cb = new URL(u.searchParams.get("callback_url")!);
    setTimeout(() => {
      void realFetch(`http://127.0.0.1:${cb.port}/callback?code=demo&state=${u.searchParams.get("state")}`).catch(() => {});
    }, 2200);
  }
  const child = new EventEmitter() as EventEmitter & { unref(): void; pid: number };
  child.unref = () => {};
  child.pid = 0;
  return child;
}) as unknown as typeof cp.spawn;
syncBuiltinESMExports();

// --------------------------------------------------------------- mock fetch
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Handler = (url: string, body: Record<string, unknown> | undefined) => Response | Promise<Response> | undefined;
let handler: Handler = () => undefined;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (/^http:\/\/127\.0\.0\.1:\d+\/callback/.test(url)) return realFetch(url, init);
  let body: Record<string, unknown> | undefined;
  try {
    body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  } catch {
    body = undefined;
  }
  const res = await handler(url, body);
  if (res) return res;
  throw new TypeError("fetch failed (offline demo)");
}) as typeof fetch;

const json = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });

/** Splits text into 1–2 word tokens, like a model stream. */
function tokens(text: string): string[] {
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 2) out.push(words.slice(i, i + 2).join(""));
  return out;
}

/** SSE body that emits `events` with delays (first token after `first` ms). */
function sse(events: unknown[], { first = 450, every = 55 } = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    async pull(c) {
      await sleep(i === 0 ? first : every);
      if (i < events.length) c.enqueue(enc.encode(`data: ${JSON.stringify(events[i++])}\n\n`));
      else {
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      }
    },
  });
}

const textEvents = (text: string) => tokens(text).map((t) => ({ choices: [{ delta: { content: t } }] }));
const streamText = (text: string, timing?: { first?: number; every?: number }, headers: Record<string, string> = {}) =>
  new Response(sse(textEvents(text), timing), { status: 200, headers: { "content-type": "text/event-stream", ...headers } });

const toolCallEvents = (id: string, name: string, args: Record<string, unknown>) => {
  const s = JSON.stringify(args);
  const a = Math.ceil(s.length / 2);
  return [
    { choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: s.slice(0, a) } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: s.slice(a) } }] } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  ];
};

const OPENROUTER_MODELS = {
  data: [
    ["openrouter/free", "0"],
    ["qwen/qwen3-coder:free", "0"],
    ["deepseek/deepseek-chat-v3.1:free", "0"],
    ["meta-llama/llama-3.3-70b-instruct:free", "0"],
    ["google/gemma-3-27b-it:free", "0"],
    ["mistralai/mistral-small-3.2-24b-instruct:free", "0"],
    ["z-ai/glm-4.5-air:free", "0"],
    ["openai/gpt-oss-20b:free", "0"],
    ["moonshotai/kimi-k2:free", "0"],
    ["nvidia/nemotron-nano-9b-v2:free", "0"],
    ["anthropic/claude-sonnet-4.5", "0.000003"],
    ["openai/gpt-5", "0.00000125"],
  ].map(([id, price]) => ({ id, name: id, context_length: 131072, pricing: { prompt: price, completion: price } })),
};
const LIMIT_HEADERS = { "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": "987" };

// ------------------------------------------------------------------ harness
const { render } = await import("ink");
const { DEFAULT_CONFIG, clearModelCaches } = await import("@the-atlas/core");
const { Chat } = await import("../src/ui/Chat.js");
const { logoRows, LETTERS } = await import("../src/ui/intro.js");
const { fgCode, hexToRgb } = await import("../src/ui/term.js");
const { C } = await import("../src/ui/theme.js");

interface Frame {
  t: number;
  ansi: string;
}

class Stdout extends EventEmitter {
  columns = COLS;
  rows = MAX_ROWS + 2;
  isTTY = true;
  constructor(private onFrame: (s: string) => void) {
    super();
  }
  write = (s: string) => {
    this.onFrame(s);
    return true;
  };
}

class Stdin extends EventEmitter {
  isTTY = true;
  data: string | null = null;
  write = (data: string) => {
    this.data = data;
    this.emit("readable");
    this.emit("data", data);
  };
  read = () => {
    const d = this.data;
    this.data = null;
    return d;
  };
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
}

class Recorder {
  frames: Frame[] = [];
  private t0 = Date.now();
  prefix = "";
  stopped = false;
  push(ansi: string) {
    if (this.stopped) return;
    this.frames.push({ t: Date.now() - this.t0, ansi: this.prefix + ansi });
  }
}

const ENTER = "\r";
const DOWN = "\u001b[B";

/** Types like a person: steady pace with a little rhythm (deterministic). */
async function type(stdin: Stdin, text: string, ms = 55) {
  let i = 0;
  for (const ch of text) {
    stdin.write(ch);
    await sleep(ms + ((i++ * 37) % 29) - 10);
  }
}

function freshHome() {
  rmSync(process.env.ATLAS_HOME!, { recursive: true, force: true });
  mkdirSync(process.env.ATLAS_HOME!, { recursive: true });
  clearModelCaches();
}

const cfgWith = (patch: Partial<typeof DEFAULT_CONFIG>) => ({ ...structuredClone(DEFAULT_CONFIG), ...patch });

/** Renders <Chat>, runs the script, returns the recorded frames. */
async function recordChat(cfg: typeof DEFAULT_CONFIG, lang: Lang, script: (stdin: Stdin, rec: Recorder) => Promise<void>, prefix = ""): Promise<Frame[]> {
  const rec = new Recorder();
  rec.prefix = prefix;
  const stdout = new Stdout((s) => {
    if (/^(\x1b\[\?25[hl])+$/.test(s)) return; // cursor show/hide only
    rec.push(s);
  });
  const stdin = new Stdin();
  const app = render(createElement(Chat, { cfg: { ...cfg, lang }, version: "0.1.0", initialLang: lang }), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: new Stdout(() => {}) as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  try {
    await sleep(900);
    await script(stdin, rec);
  } finally {
    rec.stopped = true; // unmount writes a blank frame
    app.unmount();
    app.cleanup?.();
    await sleep(100);
  }
  return rec.frames;
}

// -------------------------------------------------------------------- demos
const PAD = "  ";
const caret = `${fgCode(...hexToRgb(C.glow), 24)}▌\x1b[39m`;

/** Logo frames exactly as printLogo() draws them: one letter per 110 ms with a caret. */
function logoFrames(start = 0): Frame[] {
  return LETTERS.map((_, i) => {
    const n = i + 1;
    const rows = logoRows(n, 24).map((r, j) => PAD + r + (n < LETTERS.length && j === 4 ? caret : ""));
    return { t: start + i * 110, ansi: ["", ...rows, ""].join("\n") };
  });
}
const logoBlock = () => ["", ...logoRows(5, 24).map((r) => PAD + r), "", ""].join("\n");

/** What the person types and what the mocked models answer, per site language. */
const COPY: Record<
  Lang,
  { ask: string; answer: string; compare: string; groq: string; gemini: string; agent: string; friend: string; agentDone: string }
> = {
  uz: {
    ask: "Python'da faylni qatorma-qator qanday o'qiyman?",
    answer:
      "`with open()` ishlating, fayl o'zi yopiladi:\n\n```python\nwith open(\"data.txt\", encoding=\"utf-8\") as f:\n    for line in f:\n        print(line.strip())\n```\n\n- `encoding=\"utf-8\"` o'zbek va kirill harflarini buzmaydi\n- fayl xotiraga to'liq yuklanmaydi, katta fayllar uchun ham mos",
    compare: "/compare groq gemini CLI uchun Go yoki Rust?",
    groq: "Go: bitta binary, tez kompilyatsiya, oddiy sintaksis. CLI'ni bir kunda yozib, hamma OS uchun yig'asiz.",
    gemini: "Rust: eng tez ishga tushish va kichik xotira. clap + ratatui bilan chiroyli TUI. Lekin o'rganish uzoqroq.",
    agent: "/agent greet() ism berilmasa ham ishlasin",
    friend: "do'stim",
    agentDone: "Tayyor. `greet()` endi ismsiz ham ishlaydi va `Salom, do'stim!` qaytaradi. Boshqa joyga tegmadim.",
  },
  ru: {
    ask: "Как в Python прочитать файл построчно?",
    answer:
      "Используйте `with open()`, файл закроется сам:\n\n```python\nwith open(\"data.txt\", encoding=\"utf-8\") as f:\n    for line in f:\n        print(line.strip())\n```\n\n- `encoding=\"utf-8\"` не ломает кириллицу и узбекские буквы\n- файл не грузится в память целиком, подходит и для больших файлов",
    compare: "/compare groq gemini Go или Rust для CLI?",
    groq: "Go: один бинарник, быстрая компиляция, простой синтаксис. CLI пишется за день и собирается под все ОС.",
    gemini: "Rust: самый быстрый старт и мало памяти. С clap + ratatui красивый TUI. Но учить дольше.",
    agent: "/agent пусть greet() работает и без имени",
    friend: "друг",
    agentDone: "Готово. `greet()` теперь работает без имени и возвращает `Привет, друг!`. Остальное не трогал.",
  },
  en: {
    ask: "How do I read a file line by line in Python?",
    answer:
      "Use `with open()`, the file closes itself:\n\n```python\nwith open(\"data.txt\", encoding=\"utf-8\") as f:\n    for line in f:\n        print(line.strip())\n```\n\n- `encoding=\"utf-8\"` keeps Cyrillic and accented letters intact\n- the file is not loaded into memory at once, so big files work too",
    compare: "/compare groq gemini Go or Rust for a CLI?",
    groq: "Go: one binary, fast builds, simple syntax. You write the CLI in a day and build it for every OS.",
    gemini: "Rust: fastest startup and small memory use. clap + ratatui give a nice TUI. Takes longer to learn.",
    agent: "/agent make greet() work without a name",
    friend: "friend",
    agentDone: "Done. `greet()` now works without a name and returns `Hello, friend!`. Nothing else changed.",
  },
};

interface Demo {
  /** Language-neutral demos are recorded once and saved as <name>.json. */
  neutral?: boolean;
  run: (lang: Lang) => Promise<Frame[]>;
}

const demos: Record<string, Demo> = {
  logo: {
    neutral: true,
    async run() {
      return logoFrames(300);
    },
  },

  chat: {
    async run(lang) {
      freshHome();
      const T = COPY[lang];
      handler = (url, body) => {
        if (url === "https://openrouter.ai/api/v1/models") return json(OPENROUTER_MODELS);
        if (url === "https://openrouter.ai/api/v1/chat/completions" && body) return streamText(T.answer, { first: 900, every: 60 });
        return undefined;
      };
      const cfg = cfgWith({ keys: { openrouter: "sk-or-demo", gemini: "demo", groq: "gsk_demo" } });
      const intro = logoFrames(0);
      const frames = await recordChat(
        cfg,
        lang,
        async (stdin) => {
          await sleep(600);
          await type(stdin, T.ask);
          await sleep(450);
          stdin.write(ENTER);
          await sleep(6500);
        },
        logoBlock(),
      );
      const offset = intro.at(-1)!.t + 350;
      return [...intro, ...frames.map((f) => ({ ...f, t: f.t + offset }))];
    },
  },

  connect: {
    async run(lang) {
      freshHome();
      handler = (url) => {
        if (url === "https://openrouter.ai/api/v1/auth/keys") return json({ key: "sk-or-v1-demo" });
        if (url === "https://openrouter.ai/api/v1/models") return sleep(500).then(() => json(OPENROUTER_MODELS));
        if (url.endsWith("/models")) return json({ data: [] });
        return undefined;
      };
      const cfg = cfgWith({ keys: { groq: "gsk_demo" } });
      return recordChat(cfg, lang, async (stdin) => {
        await type(stdin, "/connect", 90);
        await sleep(700);
        stdin.write(ENTER);
        await sleep(1100);
        await type(stdin, "open", 160);
        await sleep(800);
        stdin.write(ENTER);
        await sleep(4200);
      });
    },
  },

  compare: {
    async run(lang) {
      freshHome();
      const T = COPY[lang];
      handler = (url, body) => {
        if (!body) return url.endsWith("/models") ? json({ data: [] }) : undefined;
        if (url.includes("groq.com")) return streamText(T.groq, { first: 350, every: 45 }, LIMIT_HEADERS);
        if (url.includes("generativelanguage")) return streamText(T.gemini, { first: 1100, every: 75 });
        return undefined;
      };
      const cfg = cfgWith({ keys: { groq: "gsk_demo", gemini: "demo" } });
      return recordChat(cfg, lang, async (stdin) => {
        await type(stdin, T.compare, 50);
        await sleep(400);
        stdin.write(ENTER);
        await sleep(4300);
        stdin.write(ENTER);
        await sleep(2200);
      });
    },
  },

  agent: {
    async run(lang) {
      freshHome();
      resetProject(lang);
      const T = COPY[lang];
      let step = 0;
      handler = (url, body) => {
        if (url === "https://openrouter.ai/api/v1/models") return json(OPENROUTER_MODELS);
        if (!url.endsWith("/chat/completions") || !body) return undefined;
        const n = step++;
        const events =
          n === 0
            ? toolCallEvents("call_1", "read_file", { path: "src/greet.js" })
            : n === 1
              ? toolCallEvents("call_2", "edit_file", { path: "src/greet.js", old_string: "greet(name)", new_string: `greet(name = ${JSON.stringify(T.friend)})` })
              : textEvents(T.agentDone);
        return new Response(sse(events, { first: n === 2 ? 900 : 1100, every: 60 }), { status: 200, headers: { "content-type": "text/event-stream" } });
      };
      const cfg = cfgWith({ keys: { openrouter: "sk-or-demo" }, provider: "openrouter", models: { openrouter: "qwen/qwen3-coder:free" } });
      try {
        return await recordChat(cfg, lang, async (stdin) => {
          await type(stdin, T.agent, 50);
          await sleep(400);
          stdin.write(ENTER);
          await sleep(5200);
          stdin.write(ENTER); // approve: first option ("yes")
          await sleep(4000);
        });
      } finally {
        resetProject(lang);
      }
    },
  },

  agents: {
    async run(lang) {
      freshHome();
      handler = () => undefined;
      const cfg = cfgWith({ keys: { groq: "gsk_demo" } });
      return recordChat(cfg, lang, async (stdin) => {
        await type(stdin, "/agents", 90);
        await sleep(600);
        stdin.write(ENTER);
        await sleep(1600);
        stdin.write(DOWN);
        await sleep(700);
        stdin.write(DOWN);
        await sleep(1000);
        await type(stdin, "code", 180);
        await sleep(1300);
        stdin.write(DOWN);
        await sleep(1600);
      });
    },
  },
};

// ------------------------------------------------------------ post-process
const visible = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

/** Viewport like a real terminal: newest `rows` lines, trailing blanks dropped. */
function lines(ansi: string): string[] {
  const ls = ansi.replace(/\r/g, "").split("\n");
  while (ls.length && !visible(ls.at(-1)!).trim()) ls.pop();
  return ls;
}

/** Saved shape: a deduplicated table of ANSI lines; each frame is [t, ...lineIndexes]. */
interface Recording {
  cols: number;
  rows: number;
  lines: string[];
  frames: number[][];
}

function finish(frames: Frame[]): Recording {
  // Bursts (several renders within one paint) keep only their last frame.
  const kept = frames.filter((f, i) => !(frames[i + 1] && frames[i + 1]!.t - f.t < 24));
  const rows = Math.min(MAX_ROWS, Math.max(...kept.map((f) => lines(f.ansi).length)));
  const table: string[] = [];
  const seen = new Map<string, number>();
  const out: number[][] = [];
  let prev = "";
  const t0 = kept[0]?.t ?? 0;
  for (const f of kept) {
    const ls = lines(f.ansi).slice(-rows);
    const key = ls.join("\n");
    if (out.length && key === prev) continue;
    prev = key;
    out.push([
      f.t - t0,
      ...ls.map((l) => {
        let i = seen.get(l);
        if (i === undefined) {
          i = table.push(l) - 1;
          seen.set(l, i);
        }
        return i;
      }),
    ]);
  }
  return { cols: COLS, rows, lines: table, frames: out };
}

// ------------------------------------------------------------- og.png
/** Box-drawing glyphs as strokes (fonts disagree on their size): arms + double line. */
const BOX: Record<string, [string, boolean]> = {
  "─": ["lr", false], "│": ["ud", false], "╭": ["rd", false], "╮": ["ld", false], "╰": ["ur", false], "╯": ["ul", false],
  "═": ["lr", true], "║": ["ud", true], "╔": ["rd", true], "╗": ["ld", true], "╚": ["ur", true], "╝": ["ul", true],
};

function boxPath([arms, double]: [string, boolean], x: number, y: number, w: number, h: number, fill: string): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const offs = double ? [-1.3, 1.3] : [0];
  const d: string[] = [];
  for (const o of offs) {
    // Inner line of a double corner is shorter, outer longer, so they nest.
    const corner = arms.length === 2 && arms[0] !== arms[1] && !(arms === "lr" || arms === "ud");
    for (const a of arms) {
      if (a === "l") d.push(`M${x} ${cy + o}H${corner ? cx + (arms.includes("u") ? o : -o) : cx}`);
      if (a === "r") d.push(`M${corner ? cx + (arms.includes("u") ? -o : o) : cx} ${cy + o}H${x + w + 0.4}`);
      if (a === "u") d.push(`M${cx + o} ${y}V${corner ? cy + (arms.includes("l") ? -o : o) : cy}`);
      if (a === "d") d.push(`M${cx + o} ${corner ? cy + (arms.includes("l") ? o : -o) : cy}V${y + h + 0.4}`);
    }
  }
  if (arms === "lr" || arms === "ud") {
    d.length = 0;
    for (const o of offs) d.push(arms === "lr" ? `M${x} ${cy + o}H${x + w + 0.4}` : `M${cx + o} ${y}V${y + h + 0.4}`);
  }
  return `<path d="${d.join("")}" stroke="${fill}" stroke-width="${double ? 0.9 : 1.1}" fill="none"/>`;
}

/** Social card from the last "chat" frame: SVG (one cell per glyph) → PNG via sharp, if installed. */
async function writeOg(frame: string) {
  let sharp: (input: Buffer) => { png: () => { toFile: (f: string) => Promise<unknown> } };
  try {
    sharp = (await import("sharp" as string)).default;
  } catch {
    console.log("og.png  skipped (sharp not installed)");
    return;
  }
  const { ansiRuns, escapeHtml, TERM_FG } = await import("../../../apps/site/src/components/demo/ansi.js");
  const W = 1200;
  const H = 630;
  const fs = 13.5;
  const cw = fs * (process.platform === "win32" ? 0.55 : 0.602); // Consolas / DejaVu Sans Mono advance
  const lh = fs * 1.3;
  const rows = frame.split("\n").slice(-30);
  const cols = 100;
  const win = { x: 40, y: 0, w: cols * cw + 36, h: rows.length * lh + 64 };
  win.y = Math.round((H - win.h) / 2);
  const ox = win.x + 18;
  const oy = win.y + 36 + 14;
  const cells: string[] = [];
  rows.forEach((line, r) => {
    let col = 0;
    for (const run of ansiRuns(line)) {
      const fill = run.fg ?? TERM_FG;
      for (const ch of run.text) {
        const x = ox + col * cw;
        const y = oy + r * lh;
        if (run.bg) cells.push(`<rect x="${x}" y="${y}" width="${cw + 0.4}" height="${lh}" fill="${run.bg}"/>`);
        const box = BOX[ch];
        if (ch === "█") cells.push(`<rect x="${x}" y="${y}" width="${cw + 0.4}" height="${lh + 0.4}" fill="${fill}"/>`);
        else if (box) cells.push(boxPath(box, x, y, cw, lh, fill));
        else if (ch !== " ") {
          const weight = run.bold ? ' font-weight="700"' : "";
          const op = run.dim ? ' fill-opacity="0.6"' : "";
          cells.push(`<text x="${x + cw / 2}" y="${y + lh * 0.78}" fill="${fill}"${weight}${op}>${escapeHtml(ch)}</text>`);
        }
        col++;
      }
    }
  });
  const tx = win.x + win.w + 36;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7DF9FF"/><stop offset="0.5" stop-color="#00B8FF"/><stop offset="1" stop-color="#3D5AFE"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#05070D"/>
<rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="10" fill="#070C16" stroke="#16233A"/>
<path d="M${win.x + 1} ${win.y + 36}h${win.w - 2}" stroke="#16233A"/>
${[0, 1, 2].map((i) => `<circle cx="${win.x + 18 + i * 16}" cy="${win.y + 18}" r="5" fill="#3A4E66"/>`).join("")}
<text x="${win.x + win.w / 2}" y="${win.y + 22}" fill="#6B87A8" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="12" text-anchor="middle">atlas</text>
<g font-family="Consolas, 'Cascadia Mono', 'DejaVu Sans Mono', monospace" font-size="${fs}" text-anchor="middle">${cells.join("")}</g>
<g font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif">
<text x="${tx}" y="250" fill="url(#g)" font-size="46" font-weight="800">The Atlas</text>
<text x="${tx}" y="292" fill="#E6F7FF" font-size="20">All AI assistants</text>
<text x="${tx}" y="320" fill="#E6F7FF" font-size="20">in one terminal</text>
<text x="${tx}" y="380" fill="#00E5FF" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="18">npm i -g the-atlas</text>
</g>
</svg>`;
  const file = join(ROOT, "apps/site/public/og.png");
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log(`og.png  ${W}x${H}`);
}

// Args: "chat" (all languages) or "chat.ru" (one); none = everything.
const jobs: { name: string; lang?: Lang }[] = [];
for (const arg of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(demos)) {
  const [name, only] = arg.split(".") as [string, Lang | undefined];
  const demo = demos[name];
  if (!demo) throw new Error(`Unknown demo: ${name} (${Object.keys(demos).join(", ")})`);
  if (only && !LANGS.includes(only)) throw new Error(`Unknown language: ${only} (${LANGS.join(", ")})`);
  if (demo.neutral) jobs.push({ name });
  else for (const lang of only ? [only] : LANGS) jobs.push({ name, lang });
}
mkdirSync(OUT_DIR, { recursive: true });
try {
  for (const { name, lang } of jobs) {
    const raw = await demos[name]!.run(lang ?? "uz");
    const data = finish(raw);
    const id = lang ? `${name}.${lang}` : name;
    const text = `${JSON.stringify(data)}\n`;
    writeFileSync(join(OUT_DIR, `${id}.json`), text);
    const last = data.frames.at(-1)?.[0] ?? 0;
    console.log(`${id.padEnd(11)} ${String(data.frames.length).padStart(4)} frames  ${(last / 1000).toFixed(1)}s  ${data.cols}x${data.rows}  ${(text.length / 1024).toFixed(0)} KB`);
    if (name === "chat" && lang === "uz") await writeOg(lines(raw.at(-1)!.ansi).join("\n"));
  }
} finally {
  process.chdir(ROOT);
  rmSync(SANDBOX, { recursive: true, force: true });
}
process.exit(0);
