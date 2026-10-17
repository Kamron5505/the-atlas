import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { McpStatus } from "../src/mcp/McpStatus.js";
import { mcpT } from "../src/mcp/i18n.js";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe("McpStatus", () => {
  it("shows connected / failed / disabled servers and closes on esc", async () => {
    const onClose = vi.fn();
    const r = render(
      <McpStatus
        L={mcpT("uz")}
        onClose={onClose}
        status={[
          { name: "github", state: "connected", transport: "http", tools: 12 },
          { name: "db", state: "failed", transport: "stdio", tools: 0, error: "spawn ENOENT" },
          { name: "old", state: "disabled", transport: "stdio", tools: 0 },
        ]}
      />,
    );
    const f = r.lastFrame() ?? "";
    expect(f).toContain("MCP serverlar");
    expect(f).toMatch(/● github\s+12 vosita/);
    expect(f).toContain("✗ db");
    expect(f).toContain("spawn ENOENT");
    expect(f).toMatch(/○ old\s+o'chiq/);
    await tick();
    r.stdin.write("\u001b");
    await tick();
    expect(onClose).toHaveBeenCalled();
    r.unmount();
  });

  it("shows the empty hint", () => {
    const r = render(<McpStatus L={mcpT("en")} status={[]} />);
    expect(r.lastFrame()).toContain("No MCP servers yet");
    r.unmount();
  });
});
