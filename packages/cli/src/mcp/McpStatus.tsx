import { Box, Text, useInput } from "ink";
import { C, I } from "../ui/theme.js";
import type { McpDict } from "./i18n.js";
import type { McpServerStatus } from "./manager.js";

/** Compact server list for the chat "/mcp" overlay. Esc/enter calls onClose. */
export function McpStatus({ L, status, onClose }: { L: McpDict; status: McpServerStatus[]; onClose?: () => void }) {
  useInput((_, key) => {
    if (key.escape || key.return) onClose?.();
  }, { isActive: !!onClose });
  const w = Math.max(4, ...status.map((s) => s.name.length));
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={C.neon} bold>
        {L.title}
      </Text>
      {status.length === 0 ? (
        <Text color={C.dim}>{L.none}</Text>
      ) : (
        status.map((s) => (
          <Box key={s.name}>
            <Text color={s.state === "connected" ? C.ok : s.state === "failed" ? C.err : C.faint}>
              {s.state === "connected" ? I.on : s.state === "failed" ? I.fail : I.off}{" "}
            </Text>
            <Text color={C.text}>{s.name.padEnd(w)} </Text>
            {s.state === "connected" ? (
              <Text color={C.dim}>
                {s.tools} {L.tools}
              </Text>
            ) : s.state === "failed" ? (
              <Text color={C.err} wrap="truncate-end">
                {s.error ?? L.failed}
              </Text>
            ) : (
              <Text color={C.faint}>{s.state === "disabled" ? L.disabled : L.connecting}</Text>
            )}
          </Box>
        ))
      )}
      {onClose && <Text color={C.faint}>{L.overlayHint}</Text>}
    </Box>
  );
}
