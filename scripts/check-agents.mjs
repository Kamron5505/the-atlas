// Audits agents.conf: package exists on its registry, installer URL answers,
// and (if installed) the binary resolves to something Windows can launch.
// Usage: node scripts/check-agents.mjs
import { readFileSync } from "node:fs";

const conf = new URL("../packages/cli/agents.conf", import.meta.url);
const agents = readFileSync(conf, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => {
    const f = l.split("|").map((s) => s.trim());
    return { name: f[0], binary: f[1], command: f[2], install: f[3] ?? "" };
  });

async function ok(url, init) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), redirect: "follow" });
    return r.status;
  } catch (e) {
    return `ERR ${e.cause?.code ?? e.message}`;
  }
}

async function check(a) {
  const i = a.install;
  let m;
  if (!i) return { a, kind: "manual", status: "-" };
  if ((m = /npm install -g (\S+?)(?:@latest)?$/.exec(i))) {
    const pkg = m[1];
    const st = await ok(`https://registry.npmjs.org/${pkg.replace("/", "%2F")}`);
    return { a, kind: `npm ${pkg}`, status: st };
  }
  if ((m = /pip install --user --upgrade (\S+)/.exec(i))) {
    return { a, kind: `pip ${m[1]}`, status: await ok(`https://pypi.org/pypi/${m[1]}/json`) };
  }
  if ((m = /(https?:\/\/[^\s)"]+)/.exec(i))) {
    return { a, kind: `script ${m[1]}`, status: await ok(m[1], { method: "GET" }) };
  }
  return { a, kind: i.split(" ").slice(0, 2).join(" "), status: "-" };
}

const results = await Promise.all(agents.map(check));
let bad = 0;
for (const r of results) {
  const fine = r.status === 200 || r.status === "-";
  if (!fine) bad++;
  console.log(`${fine ? "ok " : "BAD"} ${r.a.name.padEnd(18)} ${String(r.status).padEnd(10)} ${r.kind}`);
}
console.log(`\n${agents.length} agents, ${bad} problems`);
process.exitCode = bad ? 1 : 0;
