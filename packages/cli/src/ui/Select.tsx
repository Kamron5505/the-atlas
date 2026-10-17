import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import { C } from "./theme.js";

export interface SelectItem<T> {
  key: string;
  label: string;
  value: T;
  hint?: string;
  badge?: string;
  group?: string;
  disabled?: boolean;
}

/** Arrow-key list with type-to-filter, groups and a scrolling window. */
export function Select<T>({
  title,
  items,
  onSelect,
  onCancel,
  height = 10,
  filterable = true,
  footer,
}: {
  title: string;
  items: SelectItem<T>[];
  onSelect: (item: SelectItem<T>) => void;
  onCancel: () => void;
  height?: number;
  filterable?: boolean;
  footer?: string;
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
    if (input && !key.ctrl && !key.meta && input >= " " && input.length === 1) {
      setQuery((q) => q + input);
      setCursor(0);
    }
  });

  let lastGroup: string | undefined;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C.neon} paddingX={1}>
      <Text>
        <Text color={C.neon} bold>
          {title}
        </Text>
        {filterable && <Text color={C.dim}>  {query ? `🔎 ${query}` : "type to filter"}</Text>}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {visible.map((it, i) => {
          const active = start + i === pos;
          const showGroup = it.group && it.group !== lastGroup;
          lastGroup = it.group;
          return (
            <Box key={it.key} flexDirection="column">
              {showGroup && <Text color={C.blue} bold>{it.group}</Text>}
              <Text wrap="truncate">
                <Text color={active ? C.neon : C.faint}>{active ? "❯ " : "  "}</Text>
                <Text color={it.disabled ? C.faint : active ? C.text : C.user} bold={active}>
                  {it.label}
                </Text>
                {it.badge && <Text> {it.badge}</Text>}
                {it.hint && <Text color={C.dim}>  {it.hint}</Text>}
              </Text>
            </Box>
          );
        })}
        {filtered.length === 0 && <Text color={C.dim}>  nothing found</Text>}
      </Box>
      <Text color={C.faint}>
        {filtered.length > h ? `${pos + 1}/${filtered.length} · ` : ""}↑↓ move · ⏎ select · esc back{footer ? ` · ${footer}` : ""}
      </Text>
    </Box>
  );
}
