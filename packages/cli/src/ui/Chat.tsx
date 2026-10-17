import {
  getProvider,
  messageText,
  ProviderError,
  readyProviders,
  RouteError,
  routeChat,
  saveConfig,
  type AtlasConfig,
  type ChatMessage,
} from "@the-atlas/core";
import { Box, Static, Text, useApp, useInput, useWindowSize } from "ink";
import TextInput from "ink-text-input";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, useRef, useState } from "react";
import { findBinary, installFor, loadAgents, type Agent } from "../agents/catalog.js";
import { rowsFor } from "../agents/command.js";
import { AgentMenu, type MenuResult } from "../agents/Menu.js";
import { openAgentWindow } from "../agents/run.js";
import { installPlan } from "../agents/terminal.js";
import { activeMention, applyCompletion, completePath, prepareMessage } from "../attach.js";
import { isLang, t, type Lang } from "../i18n.js";
import { formatLimit, isLow, limitFor, recordLimited, recordRequest } from "../limits.js";
import { ago, lastSession, listSessions, loadSession, newSession, saveSession, toMarkdown, type Session } from "../session.js";
import { gitInfo, renderStatusline, type GitInfo } from "../statusline.js";
import { AgentRun } from "../agent/AgentRun.js";
import { agentT } from "../agent/i18n.js";
import type { AgentResult } from "../agent/loop.js";
import { mcpT } from "../mcp/i18n.js";
import { McpManager, type McpServerStatus } from "../mcp/manager.js";
import { McpStatus } from "../mcp/McpStatus.js";
import { isVoiceKey, joinVoiceText, VoiceInput, voiceT } from "../voice/index.js";
import { Compare, compareTargets, type CompareResult, type CompareTarget } from "./Compare.js";
import { Connect, shortName } from "./Connect.js";
import { Markdown } from "./Markdown.js";
import { modelCache, ModelPicker, type ModelChoice } from "./ModelPicker.js";
import { Select, type SelectItem } from "./Select.js";
import { C, I, SPARK, type Tag } from "./theme.js";

interface Entry {
  id: number;
  kind: "header" | "step" | "ok" | "warn" | "user" | "assistant" | "info" | "error";
  text: string;
  meta?: string;
}

type Overlay =
  | null
  | { kind: "connect"; initial?: string }
  | { kind: "model" }
  | { kind: "limit"; provider: string; retry: string }
  | { kind: "agents" }
  | { kind: "install"; pick: MenuResult }
  | { kind: "history" }
  | { kind: "compare"; targets: CompareTarget[]; question: string }
  | { kind: "agent"; task: string }
  | { kind: "voice"; restore: string }
  | { kind: "mcp" };

export type ChatExit = { kind: "quit" } | { kind: "agents" };

const COMMANDS = ["agent", "connect", "model", "compare", "voice", "agents", "mcp", "history", "resume", "export", "provider", "omniroute", "clear", "lang", "help", "exit"] as const;
type CommandName = (typeof COMMANDS)[number];

const DEFAULT_CONTEXT = 128_000;

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
  if (provider === "auto") {
    const ready = readyProviders(cfg);
    const keyed = ready.filter((p) => p.def.keyRequired);
    const chain = (keyed.length ? keyed : ready).map((p) => p.def.id).slice(0, 3);
    return chain.length ? `auto ${I.swap} ${chain.join(` ${I.arrow} `)}` : "auto";
  }
  return `${provider}/${model ?? cfg.models[provider] ?? getProvider(provider)?.defaultModel ?? "?"}`;
}

const connectedNames = (cfg: AtlasConfig) =>
  readyProviders(cfg)
    .filter((p) => p.def.keyRequired)
    .map((p) => shortName(p.def));

/** ~4 chars per token; images count as ~1k tokens. */
function estimateTokens(messages: ChatMessage[]): number {
  let n = 0;
  for (const m of messages) {
    n += Math.ceil(messageText(m).length / 4);
    if (Array.isArray(m.content)) n += m.content.filter((p) => p.type === "image_url").length * 1000;
  }
  return n;
}

/** Context window and $/token of the model, from live model lists when known. */
function modelFacts(provider: string, model?: string): { context: number; prompt: number; completion: number } {
  const info = model ? modelCache.get(provider)?.find((m) => m.id === model) : undefined;
  return {
    context: info?.contextLength ?? DEFAULT_CONTEXT,
    prompt: Number(info?.pricing?.prompt ?? 0) || 0,
    completion: Number(info?.pricing?.completion ?? 0) || 0,
  };
}

/** One "✔ label  value" row, label column aligned. */
function Row({ mark, color, label, value, valueColor = C.neon, pad = 0 }: { mark: string; color: string; label: string; value: string; valueColor?: string; pad?: number }) {
  return (
    <Text>
      <Text color={color}>{mark} </Text>
      <Text color={C.text} bold>
        {label.padEnd(pad)}
      </Text>
      <Text color={valueColor}> {value}</Text>
    </Text>
  );
}

/** Transcript entries for a restored chat. */
function replay(s: Session): Entry[] {
  const out: Entry[] = [];
  let a = 0;
  for (const m of s.messages) {
    if (m.role === "user") out.push(entry("user", messageText(m).split("\n\n<file ")[0]!));
    else if (m.role === "assistant") out.push(entry("assistant", messageText(m), s.meta[a++]));
  }
  return out;
}

export function Chat({
  cfg,
  version,
  initialLang,
  initialSession,
  onExit,
}: {
  cfg: AtlasConfig;
  version: string;
  initialLang: Lang;
  initialSession?: Session;
  onExit?: (e: ChatExit) => void;
}) {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const cwd = process.cwd();
  const [lang, setLang] = useState<Lang>(initialLang);
  const L = t(lang);
  const session = useRef<Session>(initialSession ?? newSession(cwd, cfg.provider, cfg.models[cfg.provider]));
  const [log, setLog] = useState<Entry[]>(() => [
    entry("header", ""),
    ...(initialSession ? [entry("step", L.resumed, initialSession.title), ...replay(initialSession)] : []),
  ]);
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [provider, setProvider] = useState(cfg.provider);
  const [model, setModel] = useState<string | undefined>(cfg.provider === "auto" ? undefined : cfg.models[cfg.provider]);
  const [overlay, setOverlay] = useState<Overlay>(() => (connectedNames(cfg).length === 0 ? { kind: "connect" } : null));
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [compareArmed, setCompareArmed] = useState<CompareTarget[] | null>(null);
  const [git, setGit] = useState<GitInfo>(() => gitInfo(cwd));
  const [answered, setAnswered] = useState<{ provider: string; model?: string } | null>(null);
  const [cost, setCost] = useState(0);
  const history = useRef<ChatMessage[]>(initialSession ? [...initialSession.messages] : cfg.system ? [{ role: "system", content: cfg.system }] : []);
  const abort = useRef<AbortController | null>(null);
  const sent = useRef<string[]>([]);
  const histPos = useRef(-1);
  const warned = useRef(new Set<string>());
  // MCP servers connect in the background once per chat; tools are offered to agent mode.
  const mcp = useRef<McpManager | null>(null);
  const [, setMcpStatus] = useState<McpServerStatus[]>([]);
  useEffect(() => {
    let m: McpManager;
    try {
      m = new McpManager({ cwd });
    } catch (err) {
      // A broken mcp.json must not take the chat down.
      push(entry("error", `mcp.json: ${(err as Error).message}`));
      return;
    }
    mcp.current = m;
    void m.connectAll().then(setMcpStatus);
    return () => {
      void m.closeAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tick = useTicker(streaming !== null);

  const push = (...e: Entry[]) => setLog((l) => [...l, ...e]);
  const idle = overlay === null && streaming === null;
  const slashMatches: CommandName[] = idle && input.startsWith("/") && !input.includes(" ") ? COMMANDS.filter((c) => c.startsWith(input.slice(1).toLowerCase())) : [];
  const mention = idle && !slashMatches.length ? activeMention(input) : undefined;
  const fileMatches = mention !== undefined ? completePath(mention, cwd) : [];
  const suggestions = slashMatches.length ? slashMatches.map((c) => `/${c}`) : fileMatches;
  const width = Math.max(40, Math.min(columns, 110));

  const quit = (e: ChatExit = { kind: "quit" }) => {
    void mcp.current?.closeAll();
    onExit?.(e);
    exit();
  };

  const setInputMoveCursor = (v: string) => {
    setInput(v);
    setInputKey((k) => k + 1);
  };

  function persist(meta?: string) {
    const s = session.current;
    s.messages = history.current;
    if (meta !== undefined) s.meta.push(meta);
    s.provider = provider;
    s.model = model;
    saveSession(s);
  }

  function onHeaders(id: string, headers: Headers) {
    recordRequest(id, headers);
    const l = limitFor(id);
    if (l && isLow(l) && !warned.current.has(id)) {
      warned.current.add(id);
      push(entry("info", `${id} · ${L.limitLow} (${formatLimit(l)})`));
    }
  }

  useInput(
    (_ch, key) => {
      // ctrl+r = record voice; keep what was typed (ink-text-input also inserts the "r").
      if (isVoiceKey(_ch, key) && streaming === null) return setOverlay({ kind: "voice", restore: input });
      if (key.escape) {
        if (abort.current) return abort.current.abort();
        histPos.current = -1;
        setCompareArmed(null);
        return setInputMoveCursor("");
      }
      if (suggestions.length) {
        if (key.upArrow) return setSuggestIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) return setSuggestIdx((i) => Math.min(suggestions.length - 1, i + 1));
        if (key.tab) {
          const pick = suggestions[Math.min(suggestIdx, suggestions.length - 1)]!;
          setSuggestIdx(0);
          return setInputMoveCursor(slashMatches.length ? `${pick} ` : applyCompletion(input, pick));
        }
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

  function restore(s: Session) {
    session.current = s;
    history.current = [...s.messages];
    push(entry("step", L.resumed, s.title), ...replay(s));
  }

  function startCompare(targets: CompareTarget[], question: string) {
    if (targets.length < 2) return push(entry("error", L.compareNeed));
    setCompareArmed(null);
    setOverlay({ kind: "compare", targets, question });
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
        return setOverlay({ kind: "agents" });
      case "agent": {
        const task = line.trim().replace(/^\/agent\s*/i, "");
        if (!task) return push(entry("info", L.agentUsage));
        push(entry("user", `/agent ${task}`));
        return setOverlay({ kind: "agent", task });
      }
      case "mcp":
        return setOverlay({ kind: "mcp" });
      case "voice":
        return setOverlay({ kind: "voice", restore: "" });
      case "connect":
        return setOverlay({ kind: "connect", initial: arg && getProvider(arg) ? arg : undefined });
      case "omniroute":
        return setOverlay({ kind: "connect", initial: "omniroute" });
      case "history":
        return listSessions().length ? setOverlay({ kind: "history" }) : push(entry("info", L.noHistory));
      case "resume": {
        const last = lastSession(cwd);
        return last && last.id !== session.current.id ? restore(last) : push(entry("info", L.noHistory));
      }
      case "export": {
        persist();
        const file = join(cwd, arg || `atlas-chat-${session.current.id}.md`);
        writeFileSync(file, toMarkdown(session.current), "utf8");
        return push(entry("step", L.exported, file));
      }
      case "compare": {
        // Leading args that name AIs are targets; the rest is the question.
        let i = 0;
        while (i < args.length && getProvider(args[i]!.split("/")[0]!)) i++;
        const targets = compareTargets(cfg, args.slice(0, i));
        const question = args.slice(i).join(" ");
        if (targets.length < 2) return push(entry("error", L.compareNeed));
        if (!question) {
          setCompareArmed(targets);
          return push(entry("step", "/compare", targets.map((t) => t.model ? `${t.provider}/${t.model}` : t.provider).join(" · ")));
        }
        return startCompare(targets, question);
      }
      case "clear":
        history.current = history.current.filter((m) => m.role === "system");
        session.current = newSession(cwd, provider, model);
        setCost(0);
        return push(entry("ok", L.cleared));
      case "lang":
        if (!isLang(arg)) return push(entry("error", "uz · ru · en"));
        cfg.lang = arg;
        saveConfig(cfg);
        setLang(arg);
        return push(entry("ok", t(arg).saved));
      case "provider":
        if (arg !== "auto" && !getProvider(arg)) return push(entry("error", L.providerUnknown));
        selectProvider(arg);
        return push(entry("step", L.modelWord, modelLabel(cfg, arg)));
      case "model": {
        if (!arg) return setOverlay({ kind: "model" });
        const slash = arg.indexOf("/");
        const pid = slash > 0 ? arg.slice(0, slash) : "";
        if (!getProvider(pid)) return push(entry("error", L.providerUnknown));
        selectProvider(pid, arg.slice(slash + 1));
        return push(entry("step", L.modelWord, arg));
      }
      default:
        return push(entry("error", L.unknownCmd));
    }
  }

  /** Builds the user message (with @files), shows what got attached. */
  function userMessage(text: string): ChatMessage {
    const prepared = prepareMessage(text, cwd);
    push(entry("user", text));
    for (const a of prepared.attached) push(entry("info", `${a.path} · ${a.kind === "text" ? `${a.lines} ${L.lines}` : a.kind} · ${L.attached}`));
    for (const s of prepared.skipped) push(entry("error", `${s.path} · ${s.reason} · ${L.skipped}`));
    return { role: "user", content: prepared.content };
  }

  async function send(text: string, echo = true, route?: { provider: string; model?: string }) {
    if (echo) history.current.push(userMessage(text));
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStreaming("");
    setStartedAt(Date.now());
    let out = "";
    let meta = "";
    let used: { provider: string; model?: string } | null = null;
    try {
      for await (const chunk of routeChat(cfg, history.current, {
        provider: route ? route.provider : provider,
        model: route ? route.model : model,
        signal: ctrl.signal,
        onResponse: onHeaders,
        onEvent: (e) => {
          if (e.type === "provider") {
            meta = `${e.provider}/${e.model ?? "?"}`;
            used = { provider: e.provider, model: e.model };
            setStatus(meta);
          } else {
            // One busy free model is not the provider's quota — only RouteError marks limits.
            push(entry("info", `${e.provider}/${e.model ?? "?"} · ${e.limited ? L.switched : L.fallback}`));
          }
        },
      })) {
        out += chunk;
        setStreaming(out);
      }
      history.current.push({ role: "assistant", content: out });
      push(entry("assistant", out, meta));
      if (used) {
        const u = used as { provider: string; model?: string };
        setAnswered(u);
        const f = modelFacts(u.provider, u.model);
        setCost((c) => c + estimateTokens(history.current.slice(0, -1)) * f.prompt + Math.ceil(out.length / 4) * f.completion);
      }
      persist(meta);
    } catch (err) {
      if (ctrl.signal.aborted) {
        if (out) history.current.push({ role: "assistant", content: out });
        push(entry("assistant", out || "…", `${meta} · ${L.cancelled}`));
        persist(meta);
      } else if (err instanceof RouteError && err.limited) {
        for (const e of err.errors) if (e.limited) recordLimited(e.provider);
        push(entry("error", err.errors.map((e) => e.message).join("\n")));
        setOverlay({ kind: "limit", provider: err.errors[0]?.provider ?? provider, retry: text });
      } else {
        if (err instanceof ProviderError && err.limited) recordLimited(err.provider);
        history.current.pop();
        push(entry("error", (err as Error).message));
      }
    } finally {
      abort.current = null;
      setStreaming(null);
      setStatus("");
      setGit(gitInfo(cwd));
    }
  }

  function submit(value: string) {
    let text = value.trim();
    if (slashMatches.length && text.startsWith("/") && !text.includes(" ")) text = `/${slashMatches[Math.min(suggestIdx, slashMatches.length - 1)]!}`;
    setInput("");
    setSuggestIdx(0);
    histPos.current = -1;
    if (!text || streaming !== null) return;
    if (sent.current.at(-1) !== text) sent.current.push(text);
    if (text.startsWith("/")) return command(text);
    if (compareArmed) return startCompare(compareArmed, text);
    void send(text);
  }

  function finishCompare(question: string, results: CompareResult[], picked?: CompareResult) {
    setOverlay(null);
    push(entry("user", question));
    for (const r of results) {
      const time = r.total !== undefined ? `${(r.total / 1000).toFixed(1)}s` : "";
      if (r.error) push(entry("error", `${r.label} · ${r.error}`));
      else if (r.text) push(entry("assistant", r.text, `${r.label} · ${time}`));
    }
    if (!picked) return;
    history.current.push({ role: "user", content: prepareMessage(question, cwd).content });
    history.current.push({ role: "assistant", content: picked.text });
    selectProvider(picked.provider, picked.model);
    setAnswered({ provider: picked.provider, model: picked.model });
    push(entry("step", L.kept, picked.label));
    persist(picked.label);
  }

  function finishAgent(task: string, r: AgentResult) {
    setOverlay(null);
    const where = r.provider ? `${r.provider}/${r.model ?? "?"}` : "";
    const meta = [where, `${r.steps} steps`, r.changedFiles.length ? `${r.changedFiles.length} ${L.agentChanged}` : ""].filter(Boolean).join(" · ");
    if (r.text) push(entry("assistant", r.text, meta));
    if (r.changedFiles.length) push(entry("info", `${L.agentChanged}: ${r.changedFiles.join(", ")}`));
    if (r.aborted) push(entry("info", L.cancelled));
    if (r.error) push(entry("error", r.error));
    // Plain chat providers may reject tool messages, so only the task + final text join the history.
    history.current.push({ role: "user", content: task }, { role: "assistant", content: r.text || "…" });
    if (r.provider) {
      recordRequest(r.provider);
      setAnswered({ provider: r.provider, model: r.model });
    }
    persist(meta);
    setGit(gitInfo(cwd));
  }

  async function openAgent(agent: Agent, free: boolean) {
    setOverlay(null);
    try {
      const ok = await openAgentWindow(agent, { free });
      push(ok ? entry("step", agent.name, L.opened) : entry("error", `${agent.name}: ${L.noWindow}. atlas run ${agent.binary}`));
    } catch (err) {
      push(entry("error", (err as Error).message));
    }
  }

  function pickAgent(pick: MenuResult | null) {
    if (!pick) return setOverlay(null);
    if (findBinary(pick.agent)) return void openAgent(pick.agent, pick.free);
    if (!installFor(pick.agent)) {
      setOverlay(null);
      return push(entry("error", `${pick.agent.name} ${L.wslOnly} · ${pick.agent.url}`));
    }
    setOverlay({ kind: "install", pick });
  }

  function limitItems(failed: string): SelectItem<string>[] {
    const others = readyProviders(cfg).filter((p) => p.def.id !== failed);
    return [
      ...others.slice(0, 6).map((p) => {
        const l = limitFor(p.def.id);
        return {
          key: p.def.id,
          label: `${L.switchTo} ${shortName(p.def)}`,
          value: `p:${p.def.id}`,
          hint: [p.model, l ? formatLimit(l) : ""].filter(Boolean).join(" · "),
          tag: (p.def.keyRequired ? (p.def.free ? "free" : "paid") : "local") as Tag,
        };
      }),
      { key: "auto", label: L.useAuto, value: "auto", tag: "auto" as Tag },
      { key: "model", label: `${L.chooseModel} …`, value: "model" },
      { key: "connect", label: `${L.connectAnother} …`, value: "connect" },
    ];
  }

  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const spark = SPARK[tick % SPARK.length];
  const shimmer = [C.neon, C.glow, C.neon, C.blue][Math.floor(tick / 3) % 4];
  const names = connectedNames(cfg);
  const labelPad = Math.max(L.ais.length, L.modelWord.length);

  // Status line: the model that answered last (or the selected one) + its live limit.
  const shown = answered ?? (provider === "auto" ? null : { provider, model: model ?? cfg.models[provider] ?? getProvider(provider)?.defaultModel });
  const lim = shown ? limitFor(shown.provider) : undefined;
  const facts = shown ? modelFacts(shown.provider, shown.model) : { context: DEFAULT_CONTEXT };
  const statusline = renderStatusline({
    repo: git.repo,
    branch: git.branch,
    usedPct: (estimateTokens(history.current) / facts.context) * 100,
    costUsd: cost,
    added: git.added,
    removed: git.removed,
    model: `${shown ? `${shown.provider}/${shown.model ?? "?"}` : modelLabel(cfg, provider)}${lim ? ` ${formatLimit(lim)}` : ""}`,
  });

  return (
    <Box flexDirection="column" width={width}>
      <Static items={log}>
        {(e) => (
          <Box key={e.id} flexDirection="column" marginBottom={e.kind === "step" || e.kind === "ok" ? 0 : 1}>
            {e.kind === "header" && (
              <Box flexDirection="column">
                <Text color={C.dim}>
                  {"  "}
                  {L.tagline} <Text color={C.faint}>· v{version}</Text>
                </Text>
                <Text> </Text>
                {names.length ? (
                  <Row mark={I.ok} color={C.ok} label={L.ais} value={names.join(" · ")} pad={labelPad} />
                ) : (
                  <Row mark={I.warn} color={C.warn} label={L.ais} value={L.noAis} valueColor={C.warn} pad={labelPad} />
                )}
                <Row mark={I.ok} color={C.ok} label={L.modelWord} value={modelLabel(cfg, cfg.provider)} pad={labelPad} />
              </Box>
            )}
            {e.kind === "step" && <Row mark={I.ok} color={C.ok} label={e.text} value={e.meta ?? ""} />}
            {e.kind === "ok" && (
              <Text color={C.ok}>
                {I.ok} <Text color={C.text}>{e.text}</Text>
              </Text>
            )}
            {e.kind === "user" && (
              <Text>
                <Text color={C.neon} bold>
                  {I.prompt}{" "}
                </Text>
                <Text color={C.text} bold>
                  {e.text}
                </Text>
              </Text>
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
                {I.fail} {e.text}
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
            <Text color={C.faint}>
              {" "}
              {elapsed}s{status ? ` · ${status}` : ""} · {L.interrupt}
            </Text>
          </Text>
        </Box>
      )}

      {overlay?.kind === "connect" && (
        <Connect
          cfg={cfg}
          L={L}
          initial={overlay.initial}
          onStep={(q, a) => push(entry("step", q, a))}
          onDone={(msg, pid) => {
            setOverlay(null);
            if (msg) {
              push(entry("ok", msg));
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
              setAnswered(c.provider === "auto" ? null : c);
              push(entry("step", L.modelTitle, modelLabel(cfg, c.provider, c.model)));
            }
          }}
        />
      )}
      {overlay?.kind === "limit" && (
        <Select
          L={L}
          tone={C.warn}
          title={`${L.limitTitle} ${overlay.provider} · ${L.limitAsk}`}
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
            push(entry("step", L.limitAsk, it.label));
            // Re-ask the same question on the new AI.
            void send(retry, false, { provider: pid });
          }}
        />
      )}
      {overlay?.kind === "history" && (
        <Select
          L={L}
          title={L.historyTitle}
          height={12}
          items={listSessions().map((s) => ({
            key: s.id,
            label: s.title || s.id,
            value: s.id,
            hint: `${ago(s.updated)} · ${s.turns} ${L.turns} · ${s.model}`,
          }))}
          onCancel={() => setOverlay(null)}
          onSelect={(it) => {
            setOverlay(null);
            const s = loadSession(it.value);
            if (s) restore(s);
          }}
        />
      )}
      {overlay?.kind === "compare" && (
        <Compare
          cfg={cfg}
          L={L}
          width={width}
          targets={overlay.targets}
          messages={[...history.current, { role: "user", content: prepareMessage(overlay.question, cwd).content }]}
          onDone={(results, picked) => finishCompare(overlay.question, results, picked)}
        />
      )}
      {overlay?.kind === "agent" && (
        <AgentRun
          cfg={cfg}
          L={agentT(lang)}
          lang={lang}
          task={overlay.task}
          history={history.current}
          provider={provider}
          model={model}
          cwd={cwd}
          extraTools={mcp.current?.tools() ?? []}
          onDone={(r) => finishAgent(overlay.task, r)}
        />
      )}
      {overlay?.kind === "voice" && (
        <VoiceInput
          cfg={cfg}
          L={voiceT(lang)}
          lang={lang}
          onDone={(text) => {
            const r = overlay.restore;
            setOverlay(null);
            setInputMoveCursor(text ? joinVoiceText(r, text) : r);
          }}
          onError={(msg) => {
            const r = overlay.restore;
            setOverlay(null);
            setInputMoveCursor(r);
            push(entry("error", msg));
          }}
        />
      )}
      {overlay?.kind === "mcp" && <McpStatus L={mcpT(lang)} status={mcp.current?.status() ?? []} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "agents" && <AgentMenu rows={rowsFor(loadAgents(lang))} L={L} embedded onPick={pickAgent} />}
      {overlay?.kind === "install" && (
        <Select
          L={L}
          title={`${overlay.pick.agent.name} ${L.installAsk}`}
          filterable={false}
          items={[
            {
              key: "yes",
              label: L.installYes,
              value: true,
              hint: `${installPlan(overlay.pick.agent).command ?? ""}${installPlan(overlay.pick.agent).remote ? ` · ${L.remoteScript}` : ""}`,
            },
            { key: "no", label: L.installNo, value: false },
          ]}
          onCancel={() => setOverlay(null)}
          onSelect={(it) => {
            const pick = overlay.pick;
            if (!it.value) return setOverlay(null);
            push(entry("step", L.installYes, pick.agent.name));
            void openAgent(pick.agent, pick.free);
          }}
        />
      )}

      {overlay === null && (
        <Box flexDirection="column">
          <Box borderStyle="single" borderLeft={false} borderRight={false} borderColor={streaming !== null ? C.faint : compareArmed ? C.warn : C.dim}>
            <Text color={streaming !== null ? C.faint : compareArmed ? C.warn : C.neon} bold>
              {compareArmed ? "⇄ " : `${I.prompt} `}
            </Text>
            <TextInput
              key={inputKey}
              value={input}
              onChange={(v) => {
                setInput(v);
                setSuggestIdx(0);
              }}
              onSubmit={submit}
              placeholder={L.placeholder}
              focus={streaming === null}
            />
          </Box>
          {suggestions.length > 0 ? (
            <Box flexDirection="column">
              {suggestions.map((sug, i) => {
                const cmd = sug.startsWith("/") ? (sug.slice(1) as CommandName) : undefined;
                return (
                  <Text key={sug}>
                    <Text color={i === suggestIdx ? C.neon : C.faint}>{i === suggestIdx ? `${I.pointer} ` : "  "}</Text>
                    <Text color={i === suggestIdx ? C.neon : C.user} bold={i === suggestIdx}>
                      {cmd ? `/${cmd.padEnd(11)}` : `@${sug}`}
                    </Text>
                    {cmd && <Text color={C.dim}>{L.cmd[cmd]}</Text>}
                  </Text>
                );
              })}
            </Box>
          ) : (
            <Text wrap="truncate">{statusline}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
