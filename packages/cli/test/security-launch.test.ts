import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, startServer } from "@the-atlas/core";
import { beforeEach, describe, expect, it } from "vitest";
import { parseCatalog } from "../src/agents/catalog.js";
import { atlasWiring, launchAgent, probeServer } from "../src/agents/run.js";

const portOf = (s: { address(): unknown }) => (s.address() as AddressInfo).port;

beforeEach(() => {
  // launchAgent records usage; never touch the real ~/.the-atlas.
  process.env.ATLAS_HOME = mkdtempSync(join(tmpdir(), "atlas-launch-"));
});

describe("local proxy identity (port hijack)", () => {
  it("recognises the real Atlas server by HMAC proof", async () => {
    const server = await startServer(structuredClone(DEFAULT_CONFIG), { port: 0, token: "secret-token" });
    try {
      expect(await probeServer(portOf(server), "secret-token")).toBe("atlas");
      // A different token means it isn't *our* server.
      expect(await probeServer(portOf(server), "other-token")).toBe("foreign");
    } finally {
      server.close();
    }
  });

  it("treats another program on the port as foreign and never sends it the token", async () => {
    const seen: string[] = [];
    const fake = createServer((req, res) => {
      seen.push(`${req.url} ${req.headers.authorization ?? ""}`);
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ok"}');
    });
    await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
    try {
      expect(await probeServer(portOf(fake), "secret-token")).toBe("foreign");
      expect(seen.join("\n")).not.toContain("secret-token");
    } finally {
      fake.close();
    }
  });

  it("reports down when nothing listens", async () => {
    const tmp = createServer();
    await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", r));
    const port = portOf(tmp);
    tmp.close();
    expect(await probeServer(port, "t")).toBe("down");
  });
});

describe("token not on the command line", () => {
  it("Open Interpreter gets the key via env only", () => {
    const [agent] = parseCatalog("Open Interpreter|interpreter|interpreter||d|Agent|🆓");
    const w = atlasWiring(agent!, "http://127.0.0.1:4141/v1", "tok-123");
    expect(w.args.join(" ")).not.toContain("tok-123");
    expect(w.env.OPENAI_API_KEY).toBe("tok-123");
  });
});

describe("npm .cmd shims and cmd.exe metacharacters (BatBadBut)", () => {
  it.runIf(process.platform === "win32")("passes % & ^ \" through literally and runs nothing extra", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-bat-"));
    const out = join(dir, "args.txt");
    const pwned = join(dir, "pwned.txt");
    // Shim that records its raw arguments.
    writeFileSync(join(dir, "fakeagent.cmd"), `@echo off\r\necho %*> "${out}"\r\n`);
    const [agent] = parseCatalog("Fake Agent|fakeagent|fakeagent||d|Tools|🆓");
    const saved = process.env.PATH;
    process.env.PATH = `${dir};${saved}`;
    try {
      const code = await launchAgent(agent!, ["%PATH%", `a" & echo hacked > "${pwned}`, "x^y"]);
      expect(code).toBe(0);
    } finally {
      process.env.PATH = saved;
    }
    const recorded = readFileSync(out, "utf8");
    expect(recorded).not.toContain(saved!.slice(0, 20)); // %PATH% not expanded
    expect(() => readFileSync(pwned)).toThrow(); // injected command did not run
  });
});
