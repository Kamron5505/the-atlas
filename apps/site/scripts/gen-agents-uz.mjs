// Uzbek agent catalog page from packages/cli/agents.conf (Uzbek originals). Mirrors gen-agents.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Repo root, resolved from this script (apps/site/scripts → ../../..).
const root = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\\/g, "/").replace(/\/$/, "");
const conf = readFileSync(`${root}/packages/cli/agents.conf`, "utf8");
const out = `${root}/apps/site/src/content/docs/extensions/agents.mdx`;
const stripEmoji = (s) => s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u200D\uFE0F\uFE0E\u20E3]/gu, "").replace(/\s{2,}/g, " ").trim();
function classifyAuth(auth) {
  if (/🆓|bepul|free/i.test(auth)) return "Bepul tarif";
  if (auth.includes("💳")) return "Obuna";
  if (auth.includes("🌐")) return "Brauzer orqali kirish";
  if (auth.includes("🔑")) return "API kalit";
  return "Yo'q";
}
function windows(install, win) {
  if (win === "-") return "Faqat WSL";
  if (win) return "Ha";
  if (!install) return "Qo'lda";
  if (/^bash\s/.test(install)) return "Git Bash yoki WSL kerak";
  if (/^brew\s/.test(install)) return "Qo'lda";
  return "Ha";
}
const cat = { Coding: "Dasturlash", Agent: "Agent", Chat: "Chat", Tools: "Vositalar", Local: "Lokal", Pair: "Juft dasturlash" };
const cell = (s) => s.replace(/\|/g, "\|").replace(/[{}<>]/g, (c) => `&#${c.charCodeAt(0)};`);
const agents = [];
for (const raw of conf.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const f = line.split("|").map((s) => s.trim());
  if (f.length < 6 || !f[0] || !f[1] || !f[2]) continue;
  const win = f.length > 8 ? f.slice(8).join(" | ").trim() : "";
  agents.push({
    name: f[0], command: f[2], category: cat[f[5]] ?? f[5] ?? "",
    description: stripEmoji(f[4] ?? "").replace(/\s*—\s*/g, ", "),
    login: classifyAuth(f[6] ?? ""),
    loginDetail: stripEmoji(f[6] ?? "").replace(/^bepul tier — /i, "").replace(/\s*—\s*/g, ", "),
    url: f[7] ?? "", windows: windows(f[3] ?? "", win),
  });
}
const rows = agents.map((a) => {
  const name = a.url ? `[${cell(a.name)}](${a.url})` : cell(a.name);
  return `| ${name} | \`${cell(a.command)}\` | ${cell(a.category)} | ${cell(a.description)} | **${a.login}**: ${cell(a.loginDetail)} | ${a.windows} |`;
});
const page = `---
title: "Agentlar katalogi"
description: "atlas agents o'rnatishi va ishga tushirishi mumkin bo'lgan barcha ${agents.length} ta AI CLI agent."
sidebar:
  order: 2
---

{/* Generated from packages/cli/agents.conf (Uzbek originals). Do not edit by hand. */}

${agents.length} ta agent. Tanlash oynasini \`atlas agents\` (yoki chatda \`/agents\`) bilan oching yoki agentni to'g'ridan-to'g'ri \`atlas run <name>\` bilan ishga tushiring. Batafsil: [AI agentlar ishga tushirgichi](/guides/agents/).

**Windows** ustuni: **Ha** = Windows'ga to'g'ridan-to'g'ri o'rnatiladi (npm, pip, winget yoki PowerShell). **Git Bash yoki WSL kerak** = o'rnatuvchi bash skript. **Faqat WSL** = Windows uchun versiyasi yo'q. **Qo'lda** = havola orqali o'zingiz o'rnatasiz.

| Agent | Buyruq | Kategoriya | Tavsif | Kirish | Windows |
|---|---|---|---|---|---|
${rows.join("\n")}

Katalog [Aidevix CLI](https://github.com/SunnatbekYusupovTech/sunnatbeeCLI) (MIT) asosida tayyorlangan.
`;
writeFileSync(out, page, "utf8");
console.log(`wrote ${agents.length} agents -> ${out}`);
