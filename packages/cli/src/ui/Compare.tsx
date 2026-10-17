import { getProvider, readyProviders, resolveProvider, streamChat, type AtlasConfig, type ChatMessage } from "@the-atlas/core";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useRef, useState } from "react";
import type { Dict } from "../i18n.js";
import { recordLimited, recordRequest } from "../limits.js";
import { C, I, SPINNER } from "./theme.js";

export interface CompareTarget {
  provider: string;
  model?: string;
}

export interface CompareResult extends CompareTarget {
  label: string;
  text: string;
  error?: string;
  /** ms to first token / to the end. */
  ttft?: number;
  total?: number;
  done: boolean;
}

/** "/compare" args → targets. Empty = up to 3 connected AIs (key-based first). */
export function compareTargets(cfg: AtlasConfig, args: string[]): CompareTarget[] {
  if (args.length) {
    return args
      .flatMap((a): CompareTarget[] => {
        const slash = a.indexOf("/");
        const provider = slash > 0 ? a.slice(0, slash) : a;
        if (!getProvider(provider)) return [];
        return [slash > 0 ? { provider, model: a.slice(slash + 1) } : { provider }];
      })
      .slice(0, 3);
  }
  const ready = readyProviders(cfg);
  const keyed = ready.filter((p) => p.def.keyRequired);
  return (keyed.length >= 2 ? keyed : ready).slice(0, 3).map((p) => ({ provider: p.def.id }));
}

const secs = (ms?: number) => (ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`);

/** Streams one question to several AIs side by side; Enter/←→ picks the answer to keep. */
export function Compare({
  cfg,
  L,
  messages,
  targets,
  width,
  onDone,
}: {
  cfg: AtlasConfig;
  L: Dict;
  messages: ChatMessage[];
  targets: CompareTarget[];
  width: number;
  onDone: (results: CompareResult[], picked?: CompareResult) => void;
}) {
  const [results, setResults] = useState<CompareResult[]>(() =>
    targets.map((t) => {
      const p = resolveProvider(cfg, t.provider)!;
      const model = t.model ?? p.model ?? "?";
      return { ...t, model, label: `${t.provider}/${model}`, text: "", done: false };
    }),
  );
  const [pick, setPick] = useState(0);
  const abort = useRef(new AbortController());
  const allDone = results.every((r) => r.done);

  useEffect(() => {
    const started = Date.now();
    const update = (i: number, patch: Partial<CompareResult>) => setResults((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    results.forEach((r, i) => {
      void (async () => {
        const p = resolveProvider(cfg, r.provider);
        if (!p || (p.def.keyRequired && !p.apiKey)) return update(i, { error: L.providerUnknown, done: true });
        let text = "";
        try {
          for await (const chunk of streamChat(p, messages, { model: r.model, signal: abort.current.signal, onResponse: (id, h) => recordRequest(id, h) })) {
            if (!text) update(i, { ttft: Date.now() - started });
            text += chunk;
            update(i, { text });
          }
          update(i, { total: Date.now() - started, done: true });
        } catch (err) {
          if ((err as { status?: number }).status === 429) recordLimited(r.provider);
          update(i, { error: (err as Error).message, total: Date.now() - started, done: true });
        }
      })();
    });
    return () => abort.current.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((_i, key) => {
    if (key.escape) {
      abort.current.abort();
      return onDone(results.map((r) => ({ ...r, done: true })));
    }
    if (!allDone) return;
    if (key.leftArrow || key.upArrow) setPick((p) => Math.max(0, p - 1));
    if (key.rightArrow || key.downArrow) setPick((p) => Math.min(results.length - 1, p + 1));
    if (key.return) {
      const chosen = results[pick];
      onDone(results, chosen && !chosen.error ? chosen : undefined);
    }
  });

  const ok = results.filter((r) => !r.error && r.total !== undefined);
  const fastest = ok.length ? ok.reduce((a, b) => (a.total! <= b.total! ? a : b)) : undefined;
  const side = width >= results.length * 34;
  const colW = side ? Math.floor(width / results.length) : width;
  const tail = (s: string, n: number) => s.split("\n").slice(-n).join("\n");

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={C.neon} bold>
          ?{" "}
        </Text>
        <Text color={C.text} bold>
          {allDone ? L.comparePick : L.compareRunning}
        </Text>
      </Text>
      <Box flexDirection={side ? "row" : "column"}>
        {results.map((r, i) => {
          const active = allDone && i === pick;
          return (
            <Box key={r.label} flexDirection="column" width={colW} borderStyle="round" borderColor={active ? C.neon : C.faint} paddingX={1}>
              <Text wrap="truncate">
                <Text color={active ? C.neon : C.text} bold>
                  {r.label}
                </Text>
              </Text>
              <Text color={C.dim}>
                {r.done ? (r.error ? <Text color={C.err}>{I.fail}</Text> : <Text color={C.ok}>{I.ok}</Text>) : <Spinner type={SPINNER} />} {secs(r.total)}
                {r.ttft !== undefined && <Text color={C.faint}> · {L.firstToken} {secs(r.ttft)}</Text>}
                <Text color={C.faint}> · {r.text.length} ch</Text>
                {fastest === r && allDone && <Text color={C.ok}> · {L.fastest}</Text>}
              </Text>
              <Box marginTop={1}>
                {r.error ? <Text color={C.err}>{r.error.slice(0, 160)}</Text> : <Text color={C.user}>{tail(r.text, 10) || "…"}</Text>}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Text color={C.faint}>{allDone ? L.compareNav : `${L.thinking}… · esc`}</Text>
    </Box>
  );
}
