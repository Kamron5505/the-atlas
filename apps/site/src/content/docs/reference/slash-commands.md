---
title: "Slash buyruqlar"
description: "Atlas chatida yozish mumkin bo'lgan barcha buyruqlar."
sidebar:
  order: 2
---

Ularni ko'rish uchun chatda `/` yozing. Yozib filtrlang, `Tab` to'ldiradi, `Enter` ishga tushiradi.

| Buyruq | Argumentlar | Nima qiladi |
|---|---|---|
| `/agent` | `<task>` | [Agent rejimi](/guides/agent-mode/): AI avval so'rab, fayllarni tahrirlaydi va buyruqlarni ishga tushiradi |
| `/connect` | `[provider]` | AI ulash; kalit sahifasini yoki OpenRouter'ga kirishni ochadi |
| `/model` | `[provider/model]` | Argumentsiz: ro'yxatdan tanlash. Argument bilan: shu modelni o'rnatish |
| `/compare` | `[ai ai ai] [question]` | [Bir vaqtda 2 yoki 3 ta AI'dan so'rash](/guides/compare/) |
| `/voice` | | [Ovozli kiritish](/guides/voice/), `ctrl+r` bilan bir xil |
| `/agents` | | [47 ta AI kod agentidan birini ochish](/guides/agents/) |
| `/mcp` | | [MCP serverlar](/guides/mcp/) va ularning vositalari |
| `/history` | | Saqlangan chatni tanlab davom ettirish |
| `/resume` | | Shu papkadagi oxirgi chatni davom ettirish |
| `/export` | `[file]` | Chatni joriy papkaga Markdown qilib saqlash |
| `/provider` | `<id>` yoki `auto` | AI'ni almashtirish; `auto` almashishni qayta yoqadi |
| `/omniroute` | | Lokal [OmniRoute](/guides/omniroute/) ni ishga tushirish va ulash |
| `/clear` | | Yangi suhbat boshlash |
| `/lang` | `uz`, `ru` yoki `en` | Interfeys tili |
| `/help` | | Barcha buyruqlar va tugmalar |
| `/exit` | | Chiqish (`/quit` ham) |

Misollar:

```text
/model groq/llama-3.3-70b-versatile
/provider auto
/compare groq gemini what is a closure?
/export review-notes.md
/agent add a --dry-run flag to scripts/deploy.mjs
```

Provayder ID'lari: `openrouter`, `gemini`, `groq`, `cerebras`, `mistral`, `github`, `nvidia`, `sambanova`, `omniroute`, `ollama`, `openai`, `anthropic`.
