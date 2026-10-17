// One-off: Russian agent catalog, same data and rules as apps/site/scripts/gen-agents.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Repo root, resolved from this script (apps/site/scripts → ../../..).
const root = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\\/g, "/");
const conf = readFileSync(root + "packages/cli/agents.conf", "utf8");
const en = JSON.parse(readFileSync(root + "packages/cli/agents.en.json", "utf8"));
const out = root + "apps/site/src/content/docs/ru/extensions/agents.mdx";
const stripEmoji = (s) => s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u200D\uFE0F\uFE0E\u20E3]/gu, "").replace(/\s{2,}/g, " ").trim();
function classifyAuth(auth) {
  if (/🆓|bepul|free/i.test(auth)) return "Бесплатный тариф";
  if (auth.includes("💳")) return "Подписка";
  if (auth.includes("🌐")) return "Вход через браузер";
  if (auth.includes("🔑")) return "API-ключ";
  return "Нет";
}
function windows(install, win) {
  if (win === "-") return "Только WSL";
  if (win) return "Да";
  if (!install) return "Вручную";
  if (/^bash\s/.test(install)) return "Нужен Git Bash или WSL";
  if (/^brew\s/.test(install)) return "Вручную";
  return "Да";
}
const CAT = { Coding: "Код", Pair: "Парное программирование", Agent: "Агент", Local: "Локально", Chat: "Чат", Tools: "Инструменты" };
const RU = {
  "ANTHROPIC_API_KEY or Claude Pro/Max": "ANTHROPIC_API_KEY или Claude Pro/Max",
  "ChatGPT login or OPENAI_API_KEY": "вход ChatGPT или OPENAI_API_KEY",
  "Google login or GEMINI_API_KEY": "вход Google или GEMINI_API_KEY",
  "GitHub + Copilot subscription": "GitHub + подписка Copilot",
  "provider API key (local models too)": "API-ключ провайдера (и локальные модели)",
  "provider API key": "API-ключ провайдера",
  "Qwen login or API key": "вход Qwen или API-ключ",
  "Continue login or API key": "вход Continue или API-ключ",
  "Log in to your Cursor account": "вход в аккаунт Cursor",
  "Plandex login or API key": "вход Plandex или API-ключ",
  "Login/key via freebuff.com": "вход или ключ через freebuff.com",
  "free credit, then API key or subscription": "бесплатный кредит, затем API-ключ или подписка",
  "Amp login or API key": "вход Amp или API-ключ",
  "Log in to your Factory account": "вход в аккаунт Factory",
  "Augment login · subscription": "вход Augment · подписка",
  "Google login": "вход Google",
  "provider API key (OpenRouter etc.)": "API-ключ провайдера (OpenRouter и др.)",
  "iFlow login": "вход iFlow",
  "free tier or API key": "бесплатный тариф или API-ключ",
  "CodeBuddy login or API key": "вход CodeBuddy или API-ключ",
  "MOONSHOT_API_KEY or Kimi login": "MOONSHOT_API_KEY или вход Kimi",
  "free (open source), local model or key": "бесплатно (открытый код), локальная модель или ключ",
  "OPENAI_API_KEY or another provider": "OPENAI_API_KEY или другой провайдер",
  "AWS Builder ID": "AWS Builder ID",
  "Sourcegraph login or SRC_ACCESS_TOKEN": "вход Sourcegraph или SRC_ACCESS_TOKEN",
  "provider API key (OpenAI/Anthropic/OpenRouter)": "API-ключ провайдера (OpenAI/Anthropic/OpenRouter)",
  "local, no login needed": "локально, вход не нужен",
  "provider API key (OpenAI/local)": "API-ключ провайдера (OpenAI или локальная модель)",
  "OPENAI_API_KEY": "OPENAI_API_KEY",
  "free (open source), provider key": "бесплатно (открытый код), ключ провайдера",
  "no API key needed": "API-ключ не нужен",
  "free (open source), or local model": "бесплатно (открытый код), ключ или локальная модель",
  "free (open source), LLM key": "бесплатно (открытый код), ключ LLM",
  "free (open source), API key": "бесплатно (открытый код), API-ключ",
  "free (open source), OPENAI_API_KEY": "бесплатно (открытый код), OPENAI_API_KEY",
  "free (account) or API key": "бесплатно (с аккаунтом) или API-ключ",
  "free (MiniMax M2.5) or API key": "бесплатно (MiniMax M2.5) или API-ключ",
  "SuperGrok/X Premium · browser login": "SuperGrok/X Premium · вход через браузер",
  "free (preview), Google login": "бесплатно (preview), вход Google",
  "GitHub login (gh auth login)": "вход GitHub (gh auth login)",
  "CodeRabbit login": "вход CodeRabbit",
};
const missing = new Set();
const cell = (s) => s.replace(/\|/g, "\|").replace(/[{}<>]/g, (c) => `&#${c.charCodeAt(0)};`);
const agents = [];
for (const raw of conf.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const f = line.split("|").map((s) => s.trim());
  if (f.length < 6 || !f[0] || !f[1] || !f[2]) continue;
  const auth = stripEmoji(f[6] ?? "");
  const win = f.length > 8 ? f.slice(8).join(" | ").trim() : "";
  const enDetail = (en[auth] ?? auth).replace(/^free( tier)? — /i, "").replace(/\s*—\s*/g, ", ");
  if (!(enDetail in RU)) missing.add(enDetail);
  const cat = f[5] ?? "";
  if (cat && !(cat in CAT)) missing.add("category:" + cat);
  agents.push({ name: f[0], command: f[2], category: CAT[cat] ?? cat, login: classifyAuth(f[6] ?? ""),
    loginDetail: RU[enDetail] ?? enDetail, url: f[7] ?? "", windows: windows(f[3] ?? "", win) });
}
if (missing.size) { console.error("MISSING:", [...missing]); process.exit(1); }
const rows = agents.map((a) => {
  const name = a.url ? `[${cell(a.name)}](${a.url})` : cell(a.name);
  return `| ${name} | \`${cell(a.command)}\` | ${cell(a.category)} | **${a.login}**: ${cell(a.loginDetail)} | ${a.windows} |`;
});
const page = `---
title: "Каталог агентов"
description: "Все ${agents.length} AI CLI агентов, которых atlas agents умеет устанавливать и запускать."
sidebar:
  order: 2
---

{/* Generated from packages/cli/agents.conf (Russian version of apps/site/scripts/gen-agents.mjs output). Do not edit by hand. */}

${agents.length} агентов. Откройте окно выбора через \`atlas agents\` (или \`/agents\` в чате) или запустите агента сразу через \`atlas run <name>\`. См. [Запуск ИИ-агентов](/ru/guides/agents/).

Колонка **Windows**: **Да** = ставится нативно (npm, pip, winget или PowerShell). **Нужен Git Bash или WSL** = установщик это bash-скрипт. **Только WSL** = нет нативной сборки для Windows. **Вручную** = установите сами по ссылке.

| Агент | Команда | Категория | Вход | Windows |
|---|---|---|---|---|
${rows.join("\n")}

Каталог основан на [Aidevix CLI](https://github.com/SunnatbekYusupovTech/sunnatbeeCLI) (MIT).
`;
writeFileSync(out, page, "utf8");
console.log(`wrote ${agents.length} agents -> ${out}`);
