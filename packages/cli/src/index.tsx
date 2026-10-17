import {
  getProvider,
  listModels,
  loadConfig,
  maskKey,
  PROVIDERS,
  resolveProvider,
  routeChat,
  saveConfig,
  startServer,
  type ChatMessage,
} from "@the-atlas/core";
import { Command } from "commander";
import { render } from "ink";
import { randomBytes } from "node:crypto";
import { detectLang, isLang, t } from "./i18n.js";
import { readHidden } from "./prompt.js";
import { Chat } from "./ui/Chat.js";
import { registerAgents } from "./agents/command.js";
import { doctor } from "./doctor.js";

declare const __VERSION__: string | undefined;
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "0.1.0";

const c = {
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Reads piped stdin. With idleMs > 0, gives up if nothing arrives in time:
 * a non-TTY stdin that never closes (CI, IDE terminals) must not hang `ask "…"`.
 */
function readStdin(idleMs: number): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    const finish = () => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      process.stdin.pause();
      resolve(data);
    };
    const onData = (c: Buffer | string) => {
      data += c.toString();
      clearTimeout(timer);
    };
    const timer = idleMs > 0 ? setTimeout(finish, idleMs) : undefined;
    process.stdin.on("data", onData);
    process.stdin.once("end", finish);
    process.stdin.once("error", finish);
  });
}

function fail(msg: string): never {
  console.error(c.red(`✗ ${msg}`));
  process.exit(1);
}

const program = new Command()
  .name("atlas")
  .description("The Atlas — all AI assistants in one terminal")
  .version(VERSION, "-v, --version");

program
  .command("chat", { isDefault: true })
  .description("interactive chat (default)")
  .option("-p, --provider <id>", "provider id or auto")
  .option("-m, --model <model>", "model id")
  .action((opts: { provider?: string; model?: string }) => {
    const cfg = loadConfig();
    if (opts.provider) cfg.provider = opts.provider;
    if (opts.model && cfg.provider !== "auto") cfg.models[cfg.provider] = opts.model;
    if (!process.stdin.isTTY) fail("chat needs a terminal; use: atlas ask \"…\"");
    render(<Chat cfg={cfg} version={VERSION} initialLang={detectLang(cfg)} />, { exitOnCtrlC: true });
  });

program
  .command("ask")
  .description("one-shot answer to stdout (stdin is appended as context)")
  .argument("[prompt...]", "question")
  .option("-p, --provider <id>", "provider id or auto")
  .option("-m, --model <model>", "model id")
  .option("-s, --system <text>", "system prompt")
  .action(async (words: string[], opts: { provider?: string; model?: string; system?: string }) => {
    const cfg = loadConfig();
    let prompt = words.join(" ");
    if (!process.stdin.isTTY) {
      const piped = await readStdin(prompt ? 200 : 0);
      if (piped.trim()) prompt = prompt ? `${prompt}\n\n${piped}` : piped;
    }
    if (!prompt.trim()) fail("empty prompt");
    const messages: ChatMessage[] = [];
    const system = opts.system ?? cfg.system;
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    try {
      for await (const chunk of routeChat(cfg, messages, {
        provider: opts.provider,
        model: opts.model,
        onEvent: (e) => {
          if (e.type === "fallback") process.stderr.write(c.gray(`↯ ${e.error}\n`));
        },
      })) {
        process.stdout.write(chunk);
      }
      process.stdout.write("\n");
    } catch (err) {
      fail((err as Error).message);
    }
  });

const keys = program.command("keys").description("manage provider API keys (stored locally)");

keys
  .command("add")
  .argument("<provider>", "provider id")
  .argument("[key]", "API key (omit to type it hidden)")
  .description("add or replace a key")
  .action(async (id: string, key: string | undefined) => {
    const cfg = loadConfig();
    const L = t(detectLang(cfg));
    const def = getProvider(id);
    if (!def) fail(L.providerUnknown);
    if (!key) {
      if (def.signupUrl) console.log(`${L.keyGet} ${c.cyan(def.signupUrl)}`);
      key = await readHidden(`${L.keyPrompt} ${def.name} ${c.gray(L.keyHidden)}: `);
    }
    if (!key) fail("empty key");
    cfg.keys[id] = key;
    saveConfig(cfg);
    console.log(c.green(`✓ ${def.name}: ${maskKey(key)}`));
  });

keys
  .command("list")
  .description("show stored keys (masked)")
  .action(() => {
    const cfg = loadConfig();
    const entries = Object.entries(cfg.keys);
    if (!entries.length) return console.log(t(detectLang(cfg)).keyNone);
    for (const [id, k] of entries) console.log(`${id.padEnd(12)} ${maskKey(k)}`);
  });

keys
  .command("rm")
  .argument("<provider>")
  .description("remove a key")
  .action((id: string) => {
    const cfg = loadConfig();
    delete cfg.keys[id];
    saveConfig(cfg);
    console.log(`${t(detectLang(cfg)).keyRemoved} ${id}`);
  });

program
  .command("providers")
  .description("list providers and their status")
  .action(() => {
    const cfg = loadConfig();
    const L = t(detectLang(cfg));
    for (const def of PROVIDERS) {
      const p = resolveProvider(cfg, def.id)!;
      const state = !def.keyRequired ? c.cyan(L.local) : p.apiKey ? c.green(`● ${L.ready}`) : c.gray(`○ ${L.noKey}`);
      const price = def.free ? `🆓 ${L.free}` : `💳 ${L.paid}`;
      console.log(`${def.id.padEnd(11)} ${def.name.padEnd(20)} ${price.padEnd(12)} ${state}  ${c.gray(def.signupUrl ?? "")}`);
    }
  });

program
  .command("models")
  .argument("[provider]", "provider id", "openrouter")
  .option("-f, --free", "only free models")
  .option("--json", "JSON output")
  .description("list live models of a provider")
  .action(async (id: string, opts: { free?: boolean; json?: boolean }) => {
    const cfg = loadConfig();
    const p = resolveProvider(cfg, id);
    if (!p) fail(t(detectLang(cfg)).providerUnknown);
    try {
      let list = await listModels(p);
      if (opts.free) list = list.filter((m) => m.free);
      if (opts.json) return console.log(JSON.stringify(list, null, 2));
      for (const m of list) console.log(`${m.free ? "🆓" : "💳"} ${id}/${m.id}${m.contextLength ? c.gray(`  ${Math.round(m.contextLength / 1000)}k`) : ""}`);
      console.log(c.gray(`${list.length} models`));
    } catch (err) {
      fail((err as Error).message);
    }
  });

program
  .command("use")
  .argument("<provider>", "provider id or auto")
  .argument("[model]", "default model for this provider")
  .description("set default provider/model")
  .action((id: string, model: string | undefined) => {
    const cfg = loadConfig();
    if (id !== "auto" && !getProvider(id)) fail(t(detectLang(cfg)).providerUnknown);
    cfg.provider = id;
    if (model && id !== "auto") cfg.models[id] = model;
    saveConfig(cfg);
    console.log(c.green(`✓ ${id}${model ? `/${model}` : ""}`));
  });

program
  .command("lang")
  .argument("<lang>", "uz | ru | en")
  .description("set interface language")
  .action((lang: string) => {
    if (!isLang(lang)) fail("uz | ru | en");
    const cfg = loadConfig();
    cfg.lang = lang;
    saveConfig(cfg);
    console.log(c.green(`✓ ${t(lang).saved}`));
  });

program
  .command("serve")
  .description("local OpenAI-compatible endpoint with free-model fallback (for agents)")
  .option("--port <n>", "port", "4141")
  .action(async (opts: { port: string }) => {
    const cfg = loadConfig();
    const L = t(detectLang(cfg));
    if (!cfg.serveToken) {
      cfg.serveToken = `atlas-${randomBytes(18).toString("base64url")}`;
      saveConfig(cfg);
    }
    const port = Number(opts.port);
    await startServer(cfg, { port, token: cfg.serveToken, onLog: (l) => console.log(c.gray(l)) });
    const url = `http://127.0.0.1:${port}/v1`;
    console.log(c.green(`● ${L.serveReady}: ${c.bold(url)}`));
    console.log(`${L.serveHint}\n  OPENAI_BASE_URL=${url}\n  OPENAI_API_KEY=${cfg.serveToken}\n  model: auto ${c.gray("| groq/llama-3.3-70b-versatile | openrouter/<id>")}`);
  });

registerAgents(program);

program.command("doctor").description("check environment and ping providers").action(doctor);

program.parseAsync().catch((err: Error) => fail(err.message));
