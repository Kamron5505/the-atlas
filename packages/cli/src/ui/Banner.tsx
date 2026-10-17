import { Box, Text } from "ink";
import Gradient from "ink-gradient";

const LOGO = [
  " ▄▄▄  ▄▄▄▄▄ ▄     ▄▄▄   ▄▄▄▄",
  "█   █   █   █    █   █ █    ",
  "█▀▀▀█   █   █    █▀▀▀█  ▀▀▀▄",
  "█   █   █   █▄▄▄ █   █ ▄▄▄▄▀",
].join("\n");

export function Banner({ tagline, version }: { tagline: string; version: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient name="morning">
        <Text>{LOGO}</Text>
      </Gradient>
      <Text>
        <Text color="gray">the-atlas v{version} · </Text>
        <Text color="cyan">{tagline}</Text>
      </Text>
    </Box>
  );
}
