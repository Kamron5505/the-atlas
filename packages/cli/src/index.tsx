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
import { printLogo } from "./ui/intro.js";
import { a } from "./ui/ansi.js";
import { registerAgents, runAgentsMenu } from "./agents/command.js";
import { installOmniroute, omnirouteInstalled, omnirouteUp, OMNIROUTE_URL, openUrl, startOmniroute } from "./system.js";
import { Connect } from "./ui/Connect.js";
import type { ChatExit } from "./ui/Chat.js";
import { doctor } from "./doctor.js";

declare const __VERSION__: string | undefined;
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "0.1.0";

const c = { gray: a.dim, green: a.ok, red: a.err, cyan: a.neon, bold: a.bold };

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
  .action(async (opts: { provider?: string; model?: string }) => {
    const cfg = loadConfig();
    if (opts.provider) cfg.provider = opts.provider;
    if (opts.model && cfg.provider !== "auto") cfg.models[cfg.provider] = opts.model;
    if (!process.stdin.isTTY) fail("chat needs a terminal; use: atlas ask \"…\"");
    await printLogo();
    let next: ChatExit = { kind: "quit" };
    const app = render(<Chat cfg={cfg} version={VERSION} initialLang={detectLang(cfg)} onExit={(e) => (next = e)} />, { exitOnCtrlC: true });
    await app.waitUntilExit();
    if ((next as ChatExit).kind === "agents") await runAgentsMenu();
  });

program
  .command("connect")
  .argument("[provider]", "provider id")
  .description("connect an AI: pick → browser opens → paste key → verified")
  .action(async (id: string | undefined) => {
    const cfg = loadConfig();
    const L = t(detectLang(cfg));
    let msg: string | null = null;
    const app = render(
      <Connect
        cfg={cfg}
        L={L}
        initial={id}
        onStep={(q, ans) => console.log(`${a.ok("✔")} ${a.bold(q)} ${a.neon(ans)}`)}
        onDone={(m) => ((msg = m), app.unmount())}
      />,
    );
    await app.waitUntilExit();
    if (msg) console.log(`${a.ok("✔")} ${msg}`);
  });

program
  .command("omniroute")
  .description("install/start the local OmniRoute gateway and connect it")
  .option("--url <url>", "use a remote OmniRoute instead (e.g. https://gw.example.com/v1)")
  .option("--key <key>", "API key for a remote OmniRoute")
  .action(async (opts: { url?: string; key?: string }) => {
    const cfg = loadConfig();
    if (opts.url) {
      cfg.baseURLs.omniroute = opts.url.replace(/\/+$/, "");
      if (opts.key) cfg.keys.omniroute = opts.key;
      saveConfig(cfg);
    }
    const base = cfg.baseURLs.omniroute ?? `${OMNIROUTE_URL}/v1`;
    if (await omnirouteUp(base)) {
      console.log(c.green(`● OmniRoute is running: ${base}`));
    } else if (opts.url) {
      fail(`OmniRoute at ${base} is not reachable`);
    } else {
      if (!omnirouteInstalled()) {
        console.log("Installing OmniRoute: npm install -g omniroute@latest …");
        if ((await installOmniroute()) !== 0) fail("install failed — run: npm install -g omniroute");
      }
      console.log("Starting OmniRoute…");
      if (!(await startOmniroute())) fail("OmniRoute did not start — run `omniroute` manually");
      console.log(c.green(`● OmniRoute is running: ${OMNIROUTE_URL}`));
      openUrl(OMNIROUTE_URL);
    }
    cfg.order = ["omniroute", ...cfg.order.filter((x) => x !== "omniroute")];
    saveConfig(cfg);
    console.log(c.gray("OmniRoute is now first in the auto chain. Add accounts/keys in its dashboard."));
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
      const state = !def.keyRequired ? a.glow(`● ${L.local}`.padEnd(12)) : p.apiKey ? a.ok(`● ${L.ready}`.padEnd(12)) : a.faint(`○ ${L.noKey}`.padEnd(12));
      const tag = a.tag(!def.keyRequired ? "local" : def.free ? "free" : "paid");
      console.log(`  ${state} ${a.text(def.id.padEnd(11))} ${def.name.replace(/ \(local\)$/, "").padEnd(18)} ${tag}  ${a.faint(def.signupUrl ?? "")}`);
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
      const w = Math.min(60, Math.max(...list.map((m) => m.id.length + id.length + 1), 10));
      for (const m of list) console.log(`  ${a.tag(m.free ? "free" : "paid")}  ${a.text(`${id}/${m.id}`.padEnd(w))}  ${m.contextLength ? a.dim(`${Math.round(m.contextLength / 1000)}k`) : ""}`);
      console.log(a.dim(`  ${list.length} models`));
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
