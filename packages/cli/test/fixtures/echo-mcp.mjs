// Tiny stdio MCP server for tests. Modes (argv[2]): "ok" (default), "crash" (exits at once), "leak" (secret + escapes on stderr, exits), "hang" (never answers).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const mode = process.argv[2] ?? "ok";
if (mode === "crash") {
  process.stderr.write("fatal: echo fixture crashed on purpose\n");
  process.exit(3);
}
if (mode === "leak") {
  process.stderr.write("auth failed for Bearer ghp_leakedtoken123 \u001b]0;pwned\u0007\u001b[2J\n");
  process.exit(4);
}
if (mode === "hang") {
  process.stderr.write("hanging\n");
  setInterval(() => {}, 1000);
} else {
  const server = new Server({ name: "echo-fixture", version: "1.0.0" }, { capabilities: { tools: {} } });
  const obj = (props) => ({ type: "object", properties: props });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      { name: "echo", description: "Echo text back", inputSchema: obj({ text: { type: "string" } }), annotations: { readOnlyHint: true } },
      { name: "write_note", description: "Pretend to write a note", inputSchema: obj({ note: { type: "string" } }) },
      { name: "boom", description: "Always throws", inputSchema: obj({}) },
      { name: "fail_soft", description: "Returns isError", inputSchema: obj({}) },
      { name: "image", description: "Returns an image", inputSchema: obj({}) },
      { name: "big", description: "Returns 50 KB of text", inputSchema: obj({}) },
      { name: "slow", description: "Sleeps for ms", inputSchema: obj({ ms: { type: "number" } }) },
      { name: "env", description: "Returns ECHO_ENV", inputSchema: obj({}), annotations: { readOnlyHint: true } },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const a = req.params.arguments ?? {};
    switch (req.params.name) {
      case "echo":
        return { content: [{ type: "text", text: String(a.text ?? "") }] };
      case "write_note":
        return { content: [{ type: "text", text: `saved: ${a.note}` }] };
      case "boom":
        throw new Error("boom exploded");
      case "fail_soft":
        return { content: [{ type: "text", text: "soft failure" }], isError: true };
      case "image":
        return { content: [{ type: "text", text: "here" }, { type: "image", mimeType: "image/png", data: Buffer.alloc(12 * 1024).toString("base64") }] };
      case "big":
        return { content: [{ type: "text", text: "x".repeat(50_000) }] };
      case "slow":
        await new Promise((r) => setTimeout(r, Number(a.ms ?? 1000)));
        return { content: [{ type: "text", text: "done" }] };
      case "env":
        return { content: [{ type: "text", text: process.env.ECHO_ENV ?? "" }] };
      default:
        throw new Error(`unknown tool ${req.params.name}`);
    }
  });
  await server.connect(new StdioServerTransport());
}
