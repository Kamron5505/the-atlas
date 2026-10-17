import { getProvider, readyProviders, RouteError, routeChat, saveConfig, type AtlasConfig, type ChatMessage } from "@the-atlas/core";
import { Box, Static, Text, useApp, useInput, useWindowSize } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useRef, useState } from "react";
import { isLang, t, type Lang } from "../i18n.js";
import { Welcome } from "./Banner.js";
import { Connect } from "./Connect.js";
import { Markdown } from "./Markdown.js";
import { ModelPicker, type ModelChoice } from "./ModelPicker.js";
import { Select, type SelectItem } from "./Select.js";
import { C, I, SPARK, type Tag } from "./theme.js";

interface Entry {
  id: number;
  kind: "welcome" | "user" | "assistant" | "info" | "error";
  text: string;
  meta?: string;
}

type Overlay = null | { kind: "connect"; initial?: string } | { kind: "model" } | { kind: "limit"; provider: string; retry: string };

export type ChatExit = { kind: "quit" } | { kind: "agents" };

const COMMANDS = ["connect", "model", "agents", "provider", "omniroute", "clear", "lang", "help", "exit"] as const;
type CommandName = (typeof COMMANDS)[number];

let nextId = 0;
const entry = (kind: Entry["kind"], text: string, meta?: string): Entry => ({ id: nextId++, kind, text, meta });

function useTicker(active: boolean, ms = 120): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return n;
}

function modelLabel(cfg: AtlasConfig, provider: string, model?: string): string {
  if (provider === "auto") return "auto";
  return `${provider}/${model ?? cfg.models[provider] ?? getProvider(provider)?.defaultModel ?? "?"}`;
}

export function Chat({
  cfg,
  version,
  initialLang,
  onExit,
}: {
  cfg: AtlasConfig;
  version: string;
  initialLang: Lang;
  onExit?: (e: ChatExit) => void;
}) {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const [lang, setLang] = useState<Lang>(initialLang);
  const L = t(lang);
  const [log, setLog] = useState<Entry[]>(() => [entry("welcome", "")]);
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [provider, setProvider] = useState(cfg.provider);
  const [model, setModel] = useState<string | undefined>(cfg.provider === "auto" ? undefined : cfg.models[cfg.provider]);
  const [overlay, setOverlay] = useState<Overlay>(() => (readyProviders(cfg).filter((p) => p.def.keyRequired).length === 0 ? { kind: "connect" } : null));
  const [slashIdx, setSlashIdx] = useState(0);
  const history = useRef<ChatMessage[]>(cfg.system ? [{ role: "system", content: cfg.system }] : []);
  const abort = useRef<AbortController | null>(null);
  const sent = useRef<string[]>([]);
  const histPos = useRef(-1);
  const tick = useTicker(streaming !== null);

  const push = (...e: Entry[]) => setLog((l) => [...l, ...e]);
  const slashOpen = overlay === null && streaming === null && input.startsWith("/") && !input.includes(" ");
  const slashMatches: CommandName[] = slashOpen ? COMMANDS.filter((c) => c.startsWith(input.slice(1).toLowerCase())) : [];
  const width = Math.max(40, Math.min(columns, 110));

  const quit = (e: ChatExit = { kind: "quit" }) => {
    onExit?.(e);
    exit();
  };

  const setInputMoveCursor = (v: string) => {
    setInput(v);
    setInputKey((k) => k + 1);
  };

  useInput(
    (_ch, key) => {
      if (key.escape) {
        if (abort.current) return abort.current.abort();
        histPos.current = -1;
        return setInputMoveCursor("");
      }
      if (slashMatches.length) {
        if (key.upArrow) setSlashIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) setSlashIdx((i) => Math.min(slashMatches.length - 1, i + 1));
        if (key.tab) setInputMoveCursor(`/${slashMatches[Math.min(slashIdx, slashMatches.length - 1)]!} `);
        return;
      }
      if (streaming !== null || !sent.current.length) return;
      // Shell-like history of sent messages.
      if (key.upArrow) {
        histPos.current = Math.min(sent.current.length - 1, histPos.current + 1);
        setInputMoveCursor(sent.current[sent.current.length - 1 - histPos.current]!);
      } else if (key.downArrow) {
        histPos.current = Math.max(-1, histPos.current - 1);
        setInputMoveCursor(histPos.current < 0 ? "" : sent.current[sent.current.length - 1 - histPos.current]!);
      }
    },
    { isActive: overlay === null },
  );

  function selectProvider(pid: string, m?: string) {
    setProvider(pid);
    setModel(m);
    cfg.provider = pid;
    if (m && pid !== "auto") cfg.models[pid] = m;
    saveConfig(cfg);
  }

  function command(line: string) {
    const [cmd = "", ...args] = line.slice(1).trim().split(/\s+/);
    const arg = args.join(" ");
    const resolved = COMMANDS.find((c) => c === cmd.toLowerCase()) ?? cmd;
    switch (resolved) {
      case "help":
        return push(entry("info", [...COMMANDS.map((c) => `/${c.padEnd(11)}${L.cmd[c]}`), "", L.help].join("\n")));
      case "exit":
      case "quit":
        return quit();
      case "agents":
        return quit({ kind: "agents" });
      case "connect":
        return setOverlay({ kind: "connect", initial: arg && getProvider(arg) ? arg : undefined });
      case "omniroute":
        return setOverlay({ kind: "connect", initial: "omniroute" });
      case "clear":
        history.current = history.current.filter((m) => m.role === "system");
        return push(entry("info", L.cleared));
      case "lang":
        if (!isLang(arg)) return push(entry("error", "uz | ru | en"));
        cfg.lang = arg;
        saveConfig(cfg);
        setLang(arg);
        return push(entry("info", t(arg).saved));
      case "provider":
        if (arg !== "auto" && !getProvider(arg)) return push(entry("error", L.providerUnknown));
        selectProvider(arg);
        return push(entry("info", `${I.ok} ${modelLabel(cfg, arg)}`));
      case "model": {
        if (!arg) return setOverlay({ kind: "model" });
        const slash = arg.indexOf("/");
        const pid = slash > 0 ? arg.slice(0, slash) : "";
        if (!getProvider(pid)) return push(entry("error", L.providerUnknown));
        selectProvider(pid, arg.slice(slash + 1));
        return push(entry("info", `${I.ok} ${arg}`));
      }
      default:
        return push(entry("error", L.unknownCmd));
    }
  }

  async function send(text: string, echo = true, route?: { provider: string; model?: string }) {
    if (echo) {
      push(entry("user", text));
      history.current.push({ role: "user", content: text });
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStreaming("");
    setStartedAt(Date.now());
    let out = "";
    let meta = "";
    try {
      for await (const chunk of routeChat(cfg, history.current, {
        provider: route ? route.provider : provider,
        model: route ? route.model : model,
        signal: ctrl.signal,
        onEvent: (e) => {
          if (e.type === "provider") {
            meta = `${e.provider}/${e.model ?? "?"}`;
            setStatus(meta);
          } else if (e.limited) push(entry("info", `${e.provider} · ${L.switched}`));
          else push(entry("info", `${e.provider} · ${L.fallback}`));
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
        push(entry("assistant", out || "…", `${meta} · ${L.cancelled}`));
      } else if (err instanceof RouteError && err.limited) {
        // Keep the user message; retry after they pick another AI/model.
        push(entry("error", err.errors.map((e) => e.message).join("\n")));
        setOverlay({ kind: "limit", provider: err.errors[0]?.provider ?? provider, retry: text });
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

  function submit(value: string) {
    let text = value.trim();
    if (slashMatches.length && text.startsWith("/") && !text.includes(" ")) text = `/${slashMatches[Math.min(slashIdx, slashMatches.length - 1)]!}`;
    setInput("");
    setSlashIdx(0);
    histPos.current = -1;
    if (!text || streaming !== null) return;
    if (sent.current.at(-1) !== text) sent.current.push(text);
    if (text.startsWith("/")) return command(text);
    void send(text);
  }

  function limitItems(failed: string): SelectItem<string>[] {
    const others = readyProviders(cfg).filter((p) => p.def.id !== failed);
    return [
      ...others.slice(0, 6).map((p) => ({
        key: p.def.id,
        label: `${L.switchTo} ${p.def.name.replace(/ \(local\)$/, "")}`,
        value: `p:${p.def.id}`,
        hint: p.model,
        tag: (p.def.keyRequired ? (p.def.free ? "free" : "paid") : "local") as Tag,
      })),
      { key: "auto", label: L.useAuto, value: "auto", tag: "auto" as Tag },
      { key: "model", label: `${L.chooseModel} …`, value: "model" },
      { key: "connect", label: `${L.connectAnother} …`, value: "connect" },
    ];
  }

  const ready = readyProviders(cfg);
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const spark = SPARK[tick % SPARK.length];
  const shimmer = [C.neon, C.glow, C.neon, C.blue][Math.floor(tick / 3) % 4];

  return (
    <Box flexDirection="column" width={width}>
      <Static items={log}>
        {(e) => (
          <Box key={e.id} flexDirection="column" marginBottom={e.kind === "welcome" ? 0 : 1}>
            {e.kind === "welcome" && (
              <Welcome L={L} version={version} cwd={process.cwd()} connected={ready.filter((p) => p.def.keyRequired).map((p) => p.def.name)} width={width} />
            )}
            {e.kind === "user" && (
              <Box>
                <Text color={C.dim}>{`${I.prompt} `}</Text>
                <Text color={C.user}>{e.text}</Text>
              </Box>
            )}
            {e.kind === "assistant" && (
              <Box flexDirection="column">
                <Box>
                  <Text color={C.neon}>{`${I.reply} `}</Text>
                  <Box flexDirection="column" flexGrow={1}>
                    <Markdown text={e.text} />
                  </Box>
                </Box>
                {e.meta && (
                  <Text color={C.faint}>
                    {"  "}
                    {I.sub} {e.meta}
                  </Text>
                )}
              </Box>
            )}
            {e.kind === "info" && (
              <Text color={C.dim}>
                {"  "}
                {I.sub} {e.text}
              </Text>
            )}
            {e.kind === "error" && (
              <Text color={C.err}>
                {"  "}
                {I.sub} {I.fail} {e.text}
              </Text>
            )}
          </Box>
        )}
      </Static>

      {streaming !== null && (
        <Box flexDirection="column" marginBottom={1}>
          {streaming && (
            <Box>
              <Text color={C.neon}>{`${I.reply} `}</Text>
              <Box flexDirection="column" flexGrow={1}>
                <Markdown text={streaming} />
              </Box>
            </Box>
          )}
          <Text>
            <Text color={shimmer}>{spark} </Text>
            <Text color={shimmer}>{L.thinking}…</Text>
            <Text color={C.dim}>
              {" "}
              ({elapsed}s{status ? ` · ${status}` : ""} · {L.interrupt})
            </Text>
          </Text>
        </Box>
      )}

      {overlay?.kind === "connect" && (
        <Connect
          cfg={cfg}
          L={L}
          initial={overlay.initial}
          onDone={(msg, pid) => {
            setOverlay(null);
            if (msg) {
              push(entry("info", `${I.ok} ${msg}`));
              if (pid && provider !== "auto") selectProvider(pid);
            }
          }}
        />
      )}
      {overlay?.kind === "model" && (
        <ModelPicker
          cfg={cfg}
          L={L}
          onDone={(c: ModelChoice | null) => {
            setOverlay(null);
            if (c) {
              selectProvider(c.provider, c.model);
              push(entry("info", `${I.ok} ${modelLabel(cfg, c.provider, c.model)}`));
            }
          }}
        />
      )}
      {overlay?.kind === "limit" && (
        <Select
          L={L}
          tone={C.warn}
          title={`${I.warn} ${L.limitTitle} ${overlay.provider}`}
          items={limitItems(overlay.provider)}
          filterable={false}
          onCancel={() => setOverlay(null)}
          onSelect={(it) => {
            const retry = overlay.retry;
            if (it.value === "model") return setOverlay({ kind: "model" });
            if (it.value === "connect") return setOverlay({ kind: "connect" });
            setOverlay(null);
            const pid = it.value === "auto" ? "auto" : it.value.slice(2);
            selectProvider(pid);
            push(entry("info", `${I.ok} ${modelLabel(cfg, pid)}`));
            // Re-ask the same question on the new AI.
            void send(retry, false, { provider: pid });
          }}
        />
      )}

      {overlay === null && (
        <>
          <Box borderStyle="round" borderColor={streaming !== null ? C.faint : C.neon} paddingX={1}>
            <Text color={streaming !== null ? C.faint : C.neon}>{`${I.prompt} `}</Text>
            <TextInput
              key={inputKey}
              value={input}
              onChange={(v) => {
                setInput(v);
                setSlashIdx(0);
              }}
              onSubmit={submit}
              placeholder={L.placeholder}
              focus={streaming === null}
            />
          </Box>
          {slashMatches.length > 0 ? (
            <Box flexDirection="column" paddingX={2}>
              {slashMatches.map((c, i) => (
                <Text key={c}>
                  <Text color={i === slashIdx ? C.neon : C.faint}>{i === slashIdx ? `${I.pointer} ` : "  "}</Text>
                  <Text color={i === slashIdx ? C.neon : C.user} bold={i === slashIdx}>
                    /{c.padEnd(11)}
                  </Text>
                  <Text color={C.dim}>{L.cmd[c]}</Text>
                </Text>
              ))}
            </Box>
          ) : (
            <Box paddingX={2} justifyContent="space-between">
              <Text color={C.faint}>{L.shortcuts}</Text>
              <Text color={C.neon}>
                {I.brand}{" "}
                {provider === "auto" ? `auto ${I.swap} ${ready.map((p) => p.def.id).slice(0, 3).join(` ${I.arrow} `) || "—"}` : modelLabel(cfg, provider, model)}
              </Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
