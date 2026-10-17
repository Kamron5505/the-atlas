import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openUrl } from "./system.js";

const AUTH_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

const PAGE = (ok: boolean) => `<!doctype html><html><head><meta charset="utf-8"><title>The Atlas</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#05070d;color:#e6f7ff;font:16px/1.5 system-ui,sans-serif}
h1{margin:0 0 8px;font-size:28px;color:${ok ? "#00e5ff" : "#ff5c7a"}}p{margin:0;color:#6b87a8}</style></head>
<body><div><h1>${ok ? "◆ ATLAS — tayyor / готово / done" : "✗ ATLAS"}</h1><p>${ok ? "Terminalga qayting · Вернитесь в терминал · Back to the terminal" : "Login failed — try again in the terminal"}</p></div></body></html>`;

export interface OAuthOptions {
  signal?: AbortSignal;
  /** Wait at most this long for the browser (default 5 min). */
  timeoutMs?: number;
  /** Test seam: called with the URL instead of opening a browser. */
  open?: (url: string) => void;
  /** Test seam for the code → key exchange. */
  exchange?: (code: string, verifier: string) => Promise<string>;
}

async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch(EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status}`);
  const body = (await res.json()) as { key?: string };
  if (!body.key) throw new Error("OpenRouter: no key in response");
  return body.key;
}

/**
 * "Sign in with OpenRouter": opens the browser, catches the redirect on a
 * one-off localhost server (PKCE S256 + state), returns the user's own API key.
 */
export async function loginOpenRouter(o: OAuthOptions = {}): Promise<string> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");

  let server: Server | undefined;
  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), o.timeoutMs ?? 5 * 60 * 1000);
      o.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/callback") {
          res.writeHead(404).end();
          return;
        }
        const got = url.searchParams.get("code");
        const ok = !!got && url.searchParams.get("state") === state;
        res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE(ok));
        clearTimeout(timer);
        if (ok) resolve(got!);
        else reject(new Error("invalid callback"));
      });
      server.once("error", reject);
      // Loopback only: the callback never reaches the LAN.
      server.listen(0, "127.0.0.1", () => {
        const { port } = server!.address() as AddressInfo;
        const callback = `http://localhost:${port}/callback`;
        const url = `${AUTH_URL}?${new URLSearchParams({ callback_url: callback, code_challenge: challenge, code_challenge_method: "S256", state, key_label: "The Atlas CLI" })}`;
        (o.open ?? ((u: string) => openUrl(u)))(url);
      });
    });
    return await (o.exchange ?? exchangeCode)(code, verifier);
  } finally {
    server?.close();
  }
}
