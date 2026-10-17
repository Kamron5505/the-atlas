import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import type { Dict } from "../i18n.js";
import { C, I, TAG_COLOR, tagText, type Tag } from "./theme.js";

export interface SelectItem<T> {
  key: string;
  label: string;
  value: T;
  hint?: string;
  tag?: Tag;
  /** Status dot: connected / installed. */
  on?: boolean;
  group?: string;
  disabled?: boolean;
}

/** Arrow-key list with type-to-filter, groups, aligned columns and a scrolling window. */

// Typed or pasted text without control characters.
const isPrintable = (s: string) => [...s].every((ch) => ch >= " " && ch !== "\u007f");
export function Select<T>({
  L,
  title,
  items,
  onSelect,
  onCancel,
  height = 10,
  filterable = true,
  tone = C.neon,
}: {
  L: Dict;
  title: string;
  items: SelectItem<T>[];
  onSelect: (item: SelectItem<T>) => void;
  onCancel: () => void;
  height?: number;
  filterable?: boolean;
  tone?: string;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? items.filter((i) => `${i.label} ${i.hint ?? ""} ${i.group ?? ""}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const pos = Math.min(cursor, Math.max(0, filtered.length - 1));
  const h = Math.min(height, filtered.length || 1);
  const start = Math.max(0, Math.min(pos - Math.floor(h / 2), filtered.length - h));
  const visible = filtered.slice(start, start + h);
  const labelW = Math.min(34, Math.max(8, ...items.map((i) => i.label.length)));
  const hasStatus = items.some((i) => i.on !== undefined);

  useInput((input, key) => {
    if (key.escape) return onCancel();
    if (key.return) {
      const it = filtered[pos];
      if (it && !it.disabled) onSelect(it);
      return;
    }
    if (key.upArrow) return setCursor(Math.max(0, pos - 1));
    if (key.downArrow) return setCursor(Math.min(filtered.length - 1, pos + 1));
    if (key.pageUp) return setCursor(Math.max(0, pos - h));
    if (key.pageDown) return setCursor(Math.min(filtered.length - 1, pos + h));
    if (!filterable) return;
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      return setCursor(0);
    }
    if (input && !key.ctrl && !key.meta && isPrintable(input)) {
      setQuery((q) => q + input);
      setCursor(0);
    }
  });

  let lastGroup: string | undefined;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={tone} paddingX={1}>
      <Box justifyContent="space-between">
        <Text color={tone} bold>
          {title}
        </Text>
        {filterable && (
          <Text color={query ? C.text : C.faint}>
            {I.pointer} {query || L.filter}
          </Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {visible.map((it, i) => {
          const active = start + i === pos;
          const showGroup = it.group && it.group !== lastGroup;
          lastGroup = it.group;
          const label = it.label.length > labelW ? `${it.label.slice(0, labelW - 1)}…` : it.label.padEnd(labelW);
          return (
            <Box key={it.key} flexDirection="column">
              {showGroup && (
                <Text color={C.dim} bold>
                  {it.group!.toUpperCase()}
                </Text>
              )}
              <Text wrap="truncate">
                <Text color={active ? C.neon : C.faint}>{active ? `${I.pointer} ` : "  "}</Text>
                {hasStatus && <Text color={it.on ? C.ok : C.faint}>{it.on ? I.on : I.off} </Text>}
                <Text color={it.disabled ? C.faint : active ? C.text : C.user} bold={active}>
                  {label}
                </Text>
                <Text>  </Text>
                {it.tag ? <Text color={TAG_COLOR[it.tag]}>{tagText(it.tag)}</Text> : <Text>{"     "}</Text>}
                {it.hint && <Text color={C.dim}>  {it.hint}</Text>}
              </Text>
            </Box>
          );
        })}
        {filtered.length === 0 && <Text color={C.dim}>  {L.nothing}</Text>}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Text color={C.faint}>{L.keysNav}</Text>
        {filtered.length > h && (
          <Text color={C.faint}>
            {pos + 1}/{filtered.length}
          </Text>
        )}
      </Box>
    </Box>
  );
}
