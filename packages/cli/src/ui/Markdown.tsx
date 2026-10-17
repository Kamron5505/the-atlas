import { Box, Text } from "ink";
import { C } from "./theme.js";

/** Minimal markdown: fenced code blocks, headings, bullets, **bold**, `inline`. */
export function Markdown({ text }: { text: string }) {
  const parts = text.split(/^```.*$/m);
  return (
    <Box flexDirection="column">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Box key={i} borderStyle="round" borderColor={C.faint} paddingX={1}>
            <Text color={C.glow}>{part.replace(/^\n|\n$/g, "")}</Text>
          </Box>
        ) : (
          part
            .replace(/^\n|\n$/g, "")
            .split("\n")
            .map((line, j) => <Line key={`${i}-${j}`} line={line} />)
        ),
      )}
    </Box>
  );
}

function Line({ line }: { line: string }) {
  const h = /^(#{1,6})\s+(.*)$/.exec(line);
  if (h) return <Text bold color={C.neon}>{h[2]}</Text>;
  const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
  const body = bullet ? bullet[2]! : line;
  return (
    <Text>
      {bullet ? `${bullet[1]}• ` : ""}
      {inline(body)}
    </Text>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, k) => {
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) return <Text key={k} bold>{seg.slice(2, -2)}</Text>;
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) return <Text key={k} color={C.neon}>{seg.slice(1, -1)}</Text>;
    return seg;
  });
}
