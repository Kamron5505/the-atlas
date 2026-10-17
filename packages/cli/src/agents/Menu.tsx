import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useMemo, useState } from "react";
import type { Agent, AuthClass } from "./catalog.js";
import { ATLAS_READY } from "./run.js";
import { C } from "../ui/theme.js";

export const AUTH_BADGE: Record<AuthClass, { icon: string; color: string }> = {
  free: { icon: "🆓", color: "green" },
  browser: { icon: "🌐", color: "blue" },
  key: { icon: "🔑", color: "yellow" },
  paid: { icon: "💳", color: "magenta" },
  none: { icon: "·", color: "gray" },
};

export interface MenuRow {
  agent: Agent;
  installed: boolean;
  uses: number;
  last: boolean;
}

export interface MenuResult {
  agent: Agent;
  free: boolean;
}

/** Last used first, then installed, then most used, then catalog order (as in Aidevix). */
export function sortRows(rows: MenuRow[]): MenuRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.last) - Number(a.r.last) || Number(b.r.installed) - Number(a.r.installed) || b.r.uses - a.r.uses || a.i - b.i)
    .map((x) => x.r);
}

export function AgentMenu({ rows, onPick }: { rows: MenuRow[]; onPick: (r: MenuResult | null) => void }) {
  const { exit } = useApp();
  const { columns, rows: termRows } = useWindowSize();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [free, setFree] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? rows.filter((r) => `${r.agent.name} ${r.agent.binary} ${r.agent.category} ${r.agent.description}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const height = Math.max(5, Math.min(filtered.length, termRows - 8));
  const pos = Math.min(cursor, Math.max(0, filtered.length - 1));
  const start = Math.max(0, Math.min(pos - Math.floor(height / 2), filtered.length - height));
  const visible = filtered.slice(start, start + height);
  const sel = filtered[pos];
  const wide = columns >= 90;

  useInput((input, key) => {
    if (key.escape) {
      onPick(null);
      return exit();
    }
    if (key.return && sel) {
      onPick({ agent: sel.agent, free });
      return exit();
    }
    if (key.upArrow) return setCursor((c) => Math.max(0, Math.min(c, filtered.length - 1) - 1));
    if (key.downArrow) return setCursor((c) => Math.min(filtered.length - 1, c + 1));
    if (key.pageUp) return setCursor((c) => Math.max(0, c - height));
    if (key.pageDown) return setCursor((c) => Math.min(filtered.length - 1, c + height));
    if (key.tab) return setFree((f) => !f);
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      return setCursor(0);
    }
    if (input && !key.ctrl && !key.meta && input >= " ") {
      setQuery((q) => q + input);
      setCursor(0);
    }
  });

  const installedCount = rows.filter((r) => r.installed).length;

  const list = (
    <Box flexDirection="column" width={wide ? 38 : undefined}>
      {visible.map((r, i) => {
        const active = start + i === pos;
        const b = AUTH_BADGE[r.agent.authClass];
        return (
          <Text key={r.agent.name} wrap="truncate">
            <Text color={active ? C.neon : C.faint}>{active ? "❯ " : "  "}</Text>
            <Text color={r.installed ? C.ok : C.faint}>{r.installed ? "●" : "○"} </Text>
            <Text bold={active} color={active ? C.text : C.user}>
              {r.agent.name}
            </Text>
            <Text> {b.icon}</Text>
            {r.last && <Text color={C.glow}> ↩</Text>}
            {r.uses > 0 && <Text color={C.dim}> {r.uses}×</Text>}
          </Text>
        );
      })}
      {filtered.length === 0 && <Text color={C.dim}>  —</Text>}
    </Box>
  );

  const details = sel && (
    <Box flexDirection="column" borderStyle="round" borderColor={C.neon} paddingX={1} flexGrow={1} marginLeft={wide ? 1 : 0}>
      <Text bold color={C.neon}>
        {sel.agent.name} <Text color={sel.installed ? C.ok : C.faint}>{sel.installed ? "● installed" : "○ not installed"}</Text>
      </Text>
      <Text>{sel.agent.description}</Text>
      <Text> </Text>
      <Text>
        <Text color={C.dim}>command  </Text>
        {sel.agent.command}
      </Text>
      <Text>
        <Text color={C.dim}>group    </Text>
        {sel.agent.category}
      </Text>
      <Text>
        <Text color={C.dim}>login    </Text>
        <Text color={AUTH_BADGE[sel.agent.authClass].color}>{sel.agent.auth || "—"}</Text>
      </Text>
      {sel.agent.url && (
        <Text wrap="truncate">
          <Text color={C.dim}>link     </Text>
          <Text color={C.glow}>{sel.agent.url}</Text>
        </Text>
      )}
      {!sel.installed && sel.agent.install && (
        <Text wrap="truncate">
          <Text color={C.dim}>install  </Text>
          {sel.agent.install}
        </Text>
      )}
      {ATLAS_READY.has(sel.agent.binary) && <Text color={C.ok}>⚡ works with Atlas free models (Tab)</Text>}
    </Box>
  );

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={C.neon} bold>
          ◆ ATLAS agents{" "}
        </Text>
        <Text color={C.dim}>
          {installedCount}/{rows.length} installed ·{" "}
        </Text>
        <Text color={C.glow}>🔎 {query || "type to search"}</Text>
      </Text>
      <Box flexDirection={wide ? "row" : "column"} marginTop={1}>
        {list}
        {details}
      </Box>
      <Text color={C.dim}>
        ↑↓ move · ⏎ launch · Tab {free ? <Text color={C.ok}>[⚡ Atlas free models ON]</Text> : "Atlas free models off"} · Esc quit · 🆓 free 🔑 key 🌐 login 💳 paid
      </Text>
    </Box>
  );
}
