import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import type { Dict } from "../i18n.js";
import { C, GRADIENT, I } from "./theme.js";

const LOGO = [
  " █████╗ ████████╗██╗      █████╗ ███████╗",
  "██╔══██╗╚══██╔══╝██║     ██╔══██╗██╔════╝",
  "███████║   ██║   ██║     ███████║███████╗",
  "██╔══██║   ██║   ██║     ██╔══██║╚════██║",
  "██║  ██║   ██║   ███████╗██║  ██║███████║",
  "╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝",
].join("\n");

const SMALL = `${I.brand} A T L A S`;

/** Claude-style welcome: logo + framed card with status and tips. */
export function Welcome({ L, version, cwd, connected, width }: { L: Dict; version: string; cwd: string; connected: string[]; width: number }) {
  const row = (label: string, value: React.ReactNode) => (
    <Text>
      <Text color={C.dim}>{label.padEnd(7)}</Text>
      {value}
    </Text>
  );
  return (
    <Box flexDirection="column" marginBottom={1} width={width}>
      <Gradient colors={GRADIENT}>
        <Text>{width >= 48 ? LOGO : SMALL}</Text>
      </Gradient>
      <Box flexDirection="column" borderStyle="round" borderColor={C.neon} paddingX={1} marginTop={1}>
        <Text>
          <Text color={C.neon}>{I.star} </Text>
          <Text bold color={C.text}>
            {L.welcome}
          </Text>
          <Text color={C.faint}>  v{version}</Text>
        </Text>
        <Text color={C.dim}>{L.tagline}</Text>
        <Box flexDirection="column" marginTop={1}>
          {row(L.cwd, <Text color={C.user}>{cwd}</Text>)}
          {row(L.ais, connected.length ? <Text color={C.ok}>{connected.join(" · ")}</Text> : <Text color={C.warn}>{L.noAis}</Text>)}
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        {L.tips.map((tip, i) => (
          <Text key={i} color={C.dim}>
            <Text color={C.blue}>{i + 1}  </Text>
            {tip}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
