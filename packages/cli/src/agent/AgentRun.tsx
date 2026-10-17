import type { AtlasConfig, ChatMessage } from "@the-atlas/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { t, type Lang } from "../i18n.js";
import { Markdown } from "../ui/Markdown.js";
import { Select, type SelectItem } from "../ui/Select.js";
import { C, I, SPARK } from "../ui/theme.js";
import type { AgentDict } from "./i18n.js";
import { runAgent, type AgentEvent, type AgentResult } from "./loop.js";
import { builtinTools, visible } from "./tools.js";
import type { AgentTool, ApprovalAnswer, ApprovalRequest, ToolResult } from "./types.js";

type Row =
  | { id: number; kind: "text"; text: string }
  | { id: number; kind: "tool"; callId: string; line: string; state: "run" | "ok" | "err" | "declined" }
  | { id: number; kind: "note"; text: string; color: string };

let rowId = 0;

/** Short target of a tool call for the transcript (path, command or pattern). */
export function toolTarget(args: Record<string, unknown>): string {
  const v = args.path ?? args.command ?? args.pattern ?? args.url ?? args.query;
  const s = typeof v === "string" ? visible(v).replace(/\n/g, " ") : "";
  return s.length > 70 ? `${s.slice(0, 69)}…` : s;
}

/** Localized verb for a tool ("Read", "Edit", or "server · tool" for MCP). */
export function toolVerb(L: AgentDict, tool: AgentTool): string {
  if (tool.source === "atlas" && L.verbs[tool.name]) return L.verbs[tool.name]!;
  const m = /^mcp__(.+?)__(.+)$/.exec(tool.name);
  return m ? `${m[1]} · ${m[2]}` : tool.name;
}

/** One transcript line for a finished tool, e.g. "Edit src/app.ts +3 -1". */
export function toolLine(L: AgentDict, tool: AgentTool, args: Record<string, unknown>, result?: ToolResult, declined?: boolean): string {
  const verb = toolVerb(L, tool);
  if (declined) return `${verb} ${toolTarget(args)} · ${L.declined}`;
  const detail = result?.summary ?? (result ? (result.output.split("\n")[0] ?? "").slice(0, 80) : toolTarget(args));
  return visible(`${verb} ${detail}`.trim()).replace(/\n/g, " ");
}

function useTicker(active: boolean, ms = 120): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return n;
}

/** Diff/command preview with +/- colouring. Wraps, never truncates: a long command must not hide its tail. */
function Preview({ text }: { text: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C.faint} paddingX={1}>
      {text.split("\n").map((l, i) => (
        <Text
          key={i}
          wrap="wrap"
          color={i === 0 ? C.text : l.startsWith("+") ? C.ok : l.startsWith("-") ? C.err : l === "@@" ? C.faint : C.dim}
          bold={i === 0}
        >
          {l}
        </Text>
      ))}
    </Box>
  );
}

export interface AgentRunProps {
  cfg: AtlasConfig;
  /** Agent strings: agentT(lang). */
  L: AgentDict;
  lang: Lang;
  /** The user's task. */
  task: string;
  /** Earlier chat messages (without the task). */
  history?: ChatMessage[];
  /** Provider id or "auto". */
  provider?: string;
  model?: string;
  /** Project root (default process.cwd()). */
  cwd?: string;
  /** Extra tools (e.g. MCP) added to the built-in ones. */
  extraTools?: AgentTool[];
  maxSteps?: number;
  onDone: (result: AgentResult) => void;
}

/** Runs one agent task and renders it Atlas-style; Esc aborts. */
export function AgentRun({ cfg, L, lang, task, history = [], provider, model, cwd = process.cwd(), extraTools = [], maxSteps, onDone }: AgentRunProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<{ req: ApprovalRequest; resolve: (a: ApprovalAnswer) => void } | null>(null);
  const [busy, setBusy] = useState(true);
  const [where, setWhere] = useState<string>("");
  const [step, setStep] = useState(0);
  const ctrl = useRef(new AbortController());
  const started = useRef(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const tick = useTicker(busy && !pending);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const push = (r: Row) => setRows((rs) => [...rs, r]);
    const onEvent = (e: AgentEvent) => {
      switch (e.type) {
        case "step":
          setStep(e.step);
          break;
        case "provider":
          setWhere(`${e.provider}${e.model ? `/${e.model}` : ""}`);
          break;
        case "fallback":
          push({ id: rowId++, kind: "note", text: `${L.fallback}: ${e.error ?? e.provider}`, color: C.warn });
          break;
        case "text":
          setRows((rs) => {
            const last = rs[rs.length - 1];
            if (last?.kind === "text") return [...rs.slice(0, -1), { ...last, text: last.text + e.delta }];
            return [...rs, { id: rowId++, kind: "text", text: e.delta }];
          });
          break;
        case "tool_start":
          push({ id: rowId++, kind: "tool", callId: e.id, line: `${toolVerb(L, e.tool)} ${toolTarget(e.args)}`, state: "run" });
          break;
        case "tool_end": {
          const line = toolLine(L, e.tool, e.args, e.result, e.declined);
          const state = e.declined ? "declined" : e.result.isError ? "err" : "ok";
          setRows((rs) => {
            const i = rs.findIndex((r) => r.kind === "tool" && r.callId === e.id);
            const row: Row = { id: i >= 0 ? rs[i]!.id : rowId++, kind: "tool", callId: e.id, line, state };
            return i >= 0 ? [...rs.slice(0, i), row, ...rs.slice(i + 1)] : [...rs, row];
          });
          break;
        }
        case "error":
          push({ id: rowId++, kind: "note", text: `${L.failed}: ${e.error}`, color: C.err });
          break;
        default:
          break;
      }
    };
    const tools = [...builtinTools(L.words), ...extraTools];
    void runAgent({
      cfg,
      provider,
      model,
      messages: [...history, { role: "user", content: task }],
      tools,
      cwd,
      lang,
      maxSteps,
      signal: ctrl.current.signal,
      onEvent,
      approve: (req) => new Promise<ApprovalAnswer>((resolve) => setPending({ req, resolve })),
    }).then((result) => {
      setBusy(false);
      if (result.aborted) push({ id: rowId++, kind: "note", text: L.aborted, color: C.warn });
      else if (result.maxStepsReached) push({ id: rowId++, kind: "note", text: L.maxSteps, color: C.warn });
      const files = result.changedFiles.length ? `${result.changedFiles.length} ${L.changed}` : L.noChanges;
      push({ id: rowId++, kind: "note", text: `${result.steps} ${L.steps} · ${files}`, color: C.faint });
      onDone(result);
    });
    return undefined;
    // Runs once per mounted task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => ctrl.current.abort(), []);

  useInput(
    (_input, key) => {
      if (key.escape) ctrl.current.abort();
    },
    { isActive: busy && !pending },
  );

  const answer = (a: ApprovalAnswer) => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    p.resolve(a);
  };

  const items: SelectItem<ApprovalAnswer>[] = [
    { key: "yes", label: L.approveYes, value: "yes" },
    { key: "always", label: L.approveAlways, value: "always" },
    { key: "no", label: L.approveNo, value: "no" },
  ];

  return (
    <Box flexDirection="column">
      {rows.map((r) =>
        r.kind === "text" ? (
          r.text.trim() ? (
            <Box key={r.id}>
              <Text color={C.neon}>{`${I.reply} `}</Text>
              <Box flexDirection="column" flexGrow={1}>
                <Markdown text={r.text.trim()} />
              </Box>
            </Box>
          ) : null
        ) : r.kind === "tool" ? (
          <Text key={r.id} wrap="truncate">
            {"  "}
            <Text color={r.state === "err" ? C.err : r.state === "declined" ? C.warn : r.state === "run" ? C.faint : C.dim}>
              {I.sub} {r.line}
            </Text>
            {r.state === "err" && <Text color={C.err}> {I.fail}</Text>}
          </Text>
        ) : (
          <Text key={r.id} color={r.color}>
            {"  "}
            {I.sub} {r.text}
          </Text>
        ),
      )}
      {pending && (
        <Box flexDirection="column" marginTop={1}>
          <Preview text={pending.req.preview} />
          <Select
            L={t(lang)}
            title={`${L.approveTitle}: ${toolVerb(L, pending.req.tool)} ${toolTarget(pending.req.args)}?`}
            items={items}
            filterable={false}
            tone={C.warn}
            onSelect={(it) => answer(it.value)}
            onCancel={() => answer("no")}
          />
        </Box>
      )}
      {busy && !pending && (
        <Text>
          <Text color={C.neon}>{SPARK[tick % SPARK.length]} </Text>
          <Text color={C.glow}>{step > 1 ? L.working : L.thinking}…</Text>
          <Text color={C.faint}>
            {"  "}
            {where ? `${where} · ` : ""}
            {L.step} {step || 1} · {L.escStop}
          </Text>
        </Text>
      )}
    </Box>
  );
}
