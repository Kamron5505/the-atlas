import { getProvider, listModels, readyProviders, resolveProvider, routeChat, saveConfig, type AtlasConfig, type ChatMessage } from "@the-atlas/core";
import { Box, Static, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useRef, useState } from "react";
import { isLang, t, type Lang } from "../i18n.js";
import { Banner } from "./Banner.js";
import { Markdown } from "./Markdown.js";

interface Entry {
  id: number;
  kind: "banner" | "user" | "assistant" | "info" | "error";
  text: string;
  meta?: string;
}

let nextId = 0;
const entry = (kind: Entry["kind"], text: string, meta?: string): Entry => ({ id: nextId++, kind, text, meta });

export function Chat({ cfg, version, initialLang }: { cfg: AtlasConfig; version: string; initialLang: Lang }) {
  const { exit } = useApp();
  const [lang, setLang] = useState<Lang>(initialLang);
  const L = t(lang);
  const [log, setLog] = useState<Entry[]>(() => {
    const first = [entry("banner", "")];
    if (readyProviders(cfg).length === 0) first.push(entry("info", L.noProviders));
    return first;
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState(cfg.provider);
  const [model, setModel] = useState<string | undefined>(undefined);
  const history = useRef<ChatMessage[]>(cfg.system ? [{ role: "system", content: cfg.system }] : []);
  const abort = useRef<AbortController | null>(null);

  const push = (...e: Entry[]) => setLog((l) => [...l, ...e]);

  useInput((_ch, key) => {
    if (key.escape && abort.current) abort.current.abort();
  });

  async function command(line: string) {
    const [cmd, ...args] = line.slice(1).trim().split(/\s+/);
    const arg = args.join(" ");
    switch (cmd) {
      case "help":
        return push(entry("info", L.help));
      case "exit":
      case "quit":
        return exit();
      case "clear":
        history.current = history.current.filter((m) => m.role === "system");
        return push(entry("info", "✓"));
      case "lang":
        if (!isLang(arg)) return push(entry("error", "uz | ru | en"));
        cfg.lang = arg;
        saveConfig(cfg);
        setLang(arg);
        return push(entry("info", t(arg).saved));
      case "provider":
        if (arg !== "auto" && !getProvider(arg)) return push(entry("error", L.providerUnknown));
        setProvider(arg);
        setModel(undefined);
        cfg.provider = arg;
        saveConfig(cfg);
        return push(entry("info", `✓ ${arg}`));
      case "model": {
        const slash = arg.indexOf("/");
        const pid = slash > 0 ? arg.slice(0, slash) : "";
        if (!getProvider(pid)) return push(entry("error", L.providerUnknown));
        const m = arg.slice(slash + 1);
        setProvider(pid);
        setModel(m);
        cfg.provider = pid;
        cfg.models[pid] = m;
        saveConfig(cfg);
        return push(entry("info", `✓ ${pid}/${m}`));
      }
      case "models": {
        const pid = provider === "auto" ? readyProviders(cfg)[0]?.def.id : provider;
        const p = pid ? resolveProvider(cfg, pid) : undefined;
        if (!p) return push(entry("error", L.noProviders));
        try {
          const list = await listModels(p);
          const shown = list.sort((a, b) => Number(!!b.free) - Number(!!a.free)).slice(0, 40);
          return push(entry("info", shown.map((m) => `${m.free ? "🆓" : "💳"} ${pid}/${m.id}`).join("\n") + (list.length > 40 ? `\n… +${list.length - 40}` : "")));
        } catch (err) {
          return push(entry("error", (err as Error).message));
        }
      }
      default:
        return push(entry("error", L.unknownCmd));
    }
  }

  async function submit(value: string) {
    const text = value.trim();
    setInput("");
    if (!text || streaming !== null) return;
    if (text.startsWith("/")) return command(text);

    push(entry("user", text));
    history.current.push({ role: "user", content: text });
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStreaming("");
    let out = "";
    let meta = "";
    try {
      for await (const chunk of routeChat(cfg, history.current, {
        provider,
        model,
        signal: ctrl.signal,
        onEvent: (e) => {
          if (e.type === "provider") {
            meta = `${e.provider}/${e.model ?? "?"}`;
            setStatus(meta);
          } else push(entry("info", `↯ ${e.provider} ${L.fallback}`));
        },
      })) {
        out += chunk;
        setStreaming(out);
      }
      history.current.push({ role: "assistant", content: out });
      push(entry("assistant", out, meta));
    } catch (err) {
      if (ctrl.signal.aborted) {
        if (out) history.current.push({ role: "assistant", content: out });
        push(entry("assistant", `${out}\n${L.cancelled}`, meta));
      } else {
        history.current.pop();
        push(entry("error", (err as Error).message));
      }
    } finally {
      abort.current = null;
      setStreaming(null);
      setStatus("");
    }
  }

  return (
    <Box flexDirection="column">
      <Static items={log}>
        {(e) => (
          <Box key={e.id} flexDirection="column" marginBottom={e.kind === "banner" ? 0 : 1}>
            {e.kind === "banner" && <Banner tagline={L.tagline} version={version} />}
            {e.kind === "user" && (
              <Text>
                <Text color="cyan" bold>❯ </Text>
                {e.text}
              </Text>
            )}
            {e.kind === "assistant" && (
              <>
                <Markdown text={e.text} />
                {e.meta && <Text color="gray">  ◆ {e.meta}</Text>}
              </>
            )}
            {e.kind === "info" && <Text color="gray">{e.text}</Text>}
            {e.kind === "error" && <Text color="red">✗ {e.text}</Text>}
          </Box>
        )}
      </Static>

      {streaming !== null && (
        <Box flexDirection="column" marginBottom={1}>
          {streaming ? <Markdown text={streaming} /> : null}
          <Text color="gray">
            <Text color="magenta">
              <Spinner type="dots" />
            </Text>{" "}
            {L.thinking}
            {status ? ` · ${L.via} ${status}` : ""} · Esc
          </Text>
        </Box>
      )}

      <Box borderStyle="round" borderColor={streaming !== null ? "gray" : "magenta"} paddingX={1}>
        <Text color="magenta">❯ </Text>
        <TextInput value={input} onChange={setInput} onSubmit={submit} placeholder={L.placeholder} focus={streaming === null} />
      </Box>
      <Text color="gray">
        {" "}
        {provider === "auto" ? "auto ⇄ " + readyProviders(cfg).map((p) => p.def.id).slice(0, 4).join(" → ") : `${provider}/${model ?? cfg.models[provider] ?? getProvider(provider)?.defaultModel ?? "?"}`}
      </Text>
    </Box>
  );
}
