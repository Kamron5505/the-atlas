import { Box, Text } from "ink";
import Gradient from "ink-gradient";
import { C, GRADIENT } from "./theme.js";

const LOGO = [
  " █████╗ ████████╗██╗      █████╗ ███████╗",
  "██╔══██╗╚══██╔══╝██║     ██╔══██╗██╔════╝",
  "███████║   ██║   ██║     ███████║███████╗",
  "██╔══██║   ██║   ██║     ██╔══██║╚════██║",
  "██║  ██║   ██║   ███████╗██║  ██║███████║",
  "╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝",
].join("\n");

const SMALL = "◆ A T L A S";

export interface WelcomeInfo {
  version: string;
  tagline: string;
  cwd: string;
  connected: string[];
  tips: string[];
  columns: number;
}

/** Claude-style welcome: logo + framed card with status and tips. */
export function Welcome({ version, tagline, cwd, connected, tips, columns }: WelcomeInfo) {
  const wide = columns >= 48;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient colors={GRADIENT}>
        <Text>{wide ? LOGO : SMALL}</Text>
      </Gradient>
      <Box flexDirection="column" borderStyle="round" borderColor={C.neon} paddingX={1} marginTop={1} width={Math.min(columns, 72)}>
        <Text>
          <Text color={C.neon}>✦ </Text>
          <Text bold color={C.text}>
            Welcome to The Atlas
          </Text>
          <Text color={C.dim}> v{version}</Text>
        </Text>
        <Text color={C.dim}>{tagline}</Text>
        <Text> </Text>
        <Text color={C.dim}>
          cwd: <Text color={C.user}>{cwd}</Text>
        </Text>
        <Text color={C.dim}>
          AIs:{" "}
          {connected.length ? <Text color={C.ok}>{connected.join(" · ")}</Text> : <Text color={C.warn}>none yet — type /connect</Text>}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {tips.map((tip, i) => (
          <Text key={i} color={C.dim}>
            <Text color={C.blue}> {i + 1}. </Text>
            {tip}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
