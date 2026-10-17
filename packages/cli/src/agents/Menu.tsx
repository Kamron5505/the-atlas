import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useMemo, useState } from "react";
import type { Dict } from "../i18n.js";
import { C, I, stripEmoji, TAG_COLOR, tagText, type Tag } from "../ui/theme.js";
import type { Agent, AuthClass } from "./catalog.js";
import { ATLAS_READY } from "./run.js";


// Typed or pasted text without control characters.
const isPrintable = (s: string) => [...s].every((ch) => ch >= " " && ch !== "\u007f");
export const AUTH_TAG: Record<AuthClass, Tag> = {
  free: "free",
  browser: "login",
  key: "key",
  paid: "paid",
  none: "key",
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Text wrap="truncate">
      <Text color={C.dim}>{label.padEnd(10)}</Text>
      {children}
    </Text>
  );
}

export function AgentMenu({ rows, L, onPick, embedded = false }: { rows: MenuRow[]; L: Dict; onPick: (r: MenuResult | null) => void; embedded?: boolean }) {
  const { exit } = useApp();
  const { columns, rows: termRows } = useWindowSize();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [free, setFree] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? rows.filter((r) => `${r.agent.name} ${r.agent.binary} ${r.agent.category} ${r.agent.description}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const height = Math.max(5, Math.min(filtered.length, termRows - 9));
  const pos = Math.min(cursor, Math.max(0, filtered.length - 1));
  const start = Math.max(0, Math.min(pos - Math.floor(height / 2), filtered.length - height));
  const visible = filtered.slice(start, start + height);
  const sel = filtered[pos];
  const width = Math.max(40, Math.min(columns, 120));
  const wide = width >= 96;
  const nameW = 18;

  useInput((input, key) => {
    if (key.escape) {
      onPick(null);
      if (!embedded) exit();
      return;
    }
    if (key.return && sel) {
      onPick({ agent: sel.agent, free });
      if (!embedded) exit();
      return;
    }
    if (key.upArrow) return setCursor(Math.max(0, pos - 1));
    if (key.downArrow) return setCursor(Math.min(filtered.length - 1, pos + 1));
    if (key.pageUp) return setCursor(Math.max(0, pos - height));
    if (key.pageDown) return setCursor(Math.min(filtered.length - 1, pos + height));
    if (key.tab) return setFree((f) => !f);
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      return setCursor(0);
    }
    if (input && !key.ctrl && !key.meta && isPrintable(input)) {
      setQuery((q) => q + input);
      setCursor(0);
    }
  });

  const installedCount = rows.filter((r) => r.installed).length;

  const list = (
    <Box flexDirection="column" width={wide ? 44 : undefined} borderStyle="round" borderColor={C.faint} paddingX={1}>
      {visible.map((r, i) => {
        const active = start + i === pos;
        const tag = AUTH_TAG[r.agent.authClass];
        return (
          <Text key={r.agent.name} wrap="truncate">
            <Text color={active ? C.neon : C.faint}>{active ? `${I.pointer} ` : "  "}</Text>
            <Text color={r.installed ? C.ok : C.faint}>{r.installed ? I.on : I.off} </Text>
            <Text bold={active} color={active ? C.text : C.user}>
              {r.agent.name.slice(0, nameW).padEnd(nameW)}
            </Text>
            <Text color={TAG_COLOR[tag]}> {tagText(tag)}</Text>
            <Text color={C.dim}>
              {" "}
              {r.last ? I.last : " "} {r.uses > 0 ? `${r.uses}×` : ""}
            </Text>
          </Text>
        );
      })}
      {filtered.length === 0 && <Text color={C.dim}>  {L.nothing}</Text>}
    </Box>
  );

  const details = sel && (
    <Box flexDirection="column" borderStyle="round" borderColor={C.neon} paddingX={1} flexGrow={1} marginLeft={wide ? 1 : 0}>
      <Box justifyContent="space-between">
        <Text bold color={C.neon}>
          {sel.agent.name}
        </Text>
        <Text color={sel.installed ? C.ok : C.faint}>
          {sel.installed ? I.on : I.off} {sel.installed ? L.installed : L.notInstalled}
        </Text>
      </Box>
      <Text color={C.user}>{stripEmoji(sel.agent.description)}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Field label={L.aCommand}>
          <Text color={C.text}>{sel.agent.command}</Text>
        </Field>
        <Field label={L.aGroup}>
          <Text color={C.text}>{sel.agent.category}</Text>
        </Field>
        <Field label={L.aLogin}>
          <Text color={TAG_COLOR[AUTH_TAG[sel.agent.authClass]]}>{stripEmoji(sel.agent.auth) || "—"}</Text>
        </Field>
        {sel.agent.url && (
          <Field label={L.aLink}>
            <Text color={C.blue}>{sel.agent.url}</Text>
          </Field>
        )}
        {!sel.installed && sel.agent.install && (
          <Field label={L.aInstall}>
            <Text color={C.dim}>{sel.agent.install}</Text>
          </Field>
        )}
      </Box>
      {ATLAS_READY.has(sel.agent.binary) && (
        <Box marginTop={1}>
          <Text color={C.ok}>
            {I.ok} {L.atlasReady}
          </Text>
        </Box>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between" paddingX={1}>
        <Text>
          <Text color={C.neon} bold>
            {I.brand} {L.agentsTitle}
          </Text>
          <Text color={C.dim}>
            {"  "}
            {installedCount}/{rows.length} {L.installedN}
          </Text>
        </Text>
        <Text color={query ? C.text : C.faint}>
          {I.pointer} {query || L.filter}
        </Text>
      </Box>
      <Box flexDirection={wide ? "row" : "column"}>
        {list}
        {details}
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={C.faint}>{L.agentsNav} · esc</Text>
        <Text color={free ? C.ok : C.faint}>
          {free ? I.on : I.off} {free ? L.atlasOn : L.atlasOff}
        </Text>
      </Box>
    </Box>
  );
}
