---
title: "CLI buyruqlari"
description: "Barcha atlas buyruqlari va parametrlari."
sidebar:
  order: 1
---

`atlas --help` va `atlas <command> --help` xuddi shu ma'lumotni chiqaradi. Umumiy parametrlar: `-v, --version`, `-h, --help`.

## Chat va javoblar

### `atlas chat`

Interaktiv chat. Bu standart buyruq, shuning uchun faqat `atlas` yozsangiz ham shu ishga tushadi.

| Parametr | Tavsif |
|---|---|
| `-p, --provider <id>` | Provayder ID yoki `auto` |
| `-m, --model <model>` | Model ID (qat'iy provayder bilan) |
| `-c, --continue` | Shu papkadagi oxirgi chatni davom ettirish |

Interaktiv terminal kerak; skriptlarda `atlas ask` dan foydalaning.

### `atlas ask [prompt...]`

Bir martalik javobni stdout'ga chiqaradi. Pipe orqali kelgan stdin savolga kontekst sifatida qo'shiladi.

| Parametr | Tavsif |
|---|---|
| `-p, --provider <id>` | Provayder ID yoki `auto` |
| `-m, --model <model>` | Model ID |
| `-s, --system <text>` | Tizim prompti |

```bash
atlas ask "explain this error" < build.log
git diff | atlas ask "write a commit message"
```

Almashish haqidagi xabarlar stderr'ga chiqadi, shuning uchun stdout'da faqat javob bo'ladi.

### `atlas agent <task...>`

[Agent rejimi](/guides/agent-mode/): AI joriy papkada fayllarni o'qiydi, tahrirlaydi va buyruqlarni ishga tushiradi, o'zgarishlardan oldin so'raydi.

| Parametr | Tavsif |
|---|---|
| `-p, --provider <id>` | Provayder ID yoki `auto` |
| `-m, --model <model>` | Model ID |

Agent xato bilan tugasa, 1 kodi bilan chiqadi.

### `atlas voice`

Bir marta yozib oladi va tanilgan matnni chiqaradi. Batafsil: [Ovozli kiritish](/guides/voice/).

| Parametr | Tavsif |
|---|---|
| `-d, --device <name>` | Mikrofon nomi yoki raqami (`atlas voice devices` ga qarang) |
| `-s, --seconds <n>` | Yozuvning eng uzun davomiyligi, standart `120` |
| `-l, --lang <lang>` | Nutq tili uchun ishora: `uz`, `ru` yoki `en` |

| Ichki buyruq | Tavsif |
|---|---|
| `atlas voice devices` | Mikrofonlar ro'yxati; saqlangani belgilangan |
| `atlas voice device <name\|index>` | Mikrofonni eslab qolish: ro'yxatdagi raqam, nom yoki `auto` |

## Provayderlar va kalitlar

### `atlas connect [provider]`

Ulash ustasi: AI tanlaysiz, brauzer ochiladi, kalitni qo'yasiz, u tekshiriladi. OpenRouter brauzer orqali bir bosishda kirishdan foydalanadi.

### `atlas keys`

| Ichki buyruq | Tavsif |
|---|---|
| `atlas keys add <provider> [key]` | Kalit qo'shish yoki almashtirish. Yashirin kiritish uchun `key` ni yozmang |
| `atlas keys list` | Saqlangan kalitlarni yashirilgan holda ko'rsatish |
| `atlas keys rm <provider>` | Kalitni o'chirish |

### `atlas providers`

Barcha provayderlarni holati (tayyor, kalit yo'q, lokal), tarifi va kalit sahifasi bilan ko'rsatadi.

### `atlas models [provider]`

Provayderning hozirgi modellari ro'yxati. Standart provayder: `openrouter`.

| Parametr | Tavsif |
|---|---|
| `-f, --free` | Faqat bepul modellar |
| `--json` | JSON chiqish |

### `atlas use <provider> [model]`

Standart provayderni (almashish zanjiri uchun `auto`) va ixtiyoriy ravishda uning standart modelini belgilaydi.

```bash
atlas use auto
atlas use groq llama-3.3-70b-versatile
```

### `atlas omniroute`

Lokal [OmniRoute](/guides/omniroute/) shlyuzini o'rnatadi, ishga tushiradi va ulaydi.

| Parametr | Tavsif |
|---|---|
| `--url <url>` | O'rniga masofaviy OmniRoute'dan foydalanish, masalan `https://gw.example.com/v1` |
| `--key <key>` | Masofaviy OmniRoute uchun API kalit |

### `atlas serve`

Bepul modellarga almashadigan, OpenAI'ga mos lokal endpoint. Batafsil: [Lokal proksi](/guides/serve/).

| Parametr | Tavsif |
|---|---|
| `--port <n>` | Port, standart `4141` |

## Agentlar

### `atlas agents`

AI CLI agentlarini tanlash, o'rnatish va ishga tushirish. Batafsil: [AI agentlar ishga tushirgichi](/guides/agents/).

| Parametr | Tavsif |
|---|---|
| `-l, --list` | Katalogni chiqarish |
| `-f, --free` | Faqat bepul agentlar |
| `-i, --installed` | Faqat o'rnatilgan agentlar |

### `atlas run <agent> [args...]`

Agentni nomi yoki buyrug'i bo'yicha ishga tushiradi; bo'lmasa o'rnatadi. Qo'shimcha `args` agentga uzatiladi.

| Parametr | Tavsif |
|---|---|
| `--free` | Agentni Atlas bepul modellari orqali ishlatish |
| `-w, --window` | Yangi terminal oynasida ochish |
| `-y, --yes` | So'ramasdan o'rnatish |

### `atlas install <agent>`

Agentni o'rnatish.

| Parametr | Tavsif |
|---|---|
| `-y, --yes` | So'ramaslik |

## MCP

### `atlas mcp`

[MCP serverlar](/guides/mcp/) ni boshqarish (agent rejimi uchun tashqi vositalar).

| Ichki buyruq | Tavsif |
|---|---|
| `atlas mcp list` | Serverlar, ularning holati va vositalar soni |
| `atlas mcp add <name> [command...]` | Server qo'shish: shablon nomi, `--url <url>` yoki `-- <command> [args...]` |
| `atlas mcp remove <name>` | Serverni o'chirish (taxallusi `rm`) |
| `atlas mcp enable <name>` | Serverni yoqish |
| `atlas mcp disable <name>` | Serverni o'chirmasdan faolsizlantirish |
| `atlas mcp tools <name>` | Serverga ulanib, vositalarini ko'rsatish |
| `atlas mcp import <source>` | Boshqa ilovadan serverlarni import qilish (`claude` = Claude Desktop) |

`atlas mcp add` parametrlari:

| Parametr | Tavsif |
|---|---|
| `--url <url>` | Masofaviy server URL'i (Streamable HTTP yoki SSE) |
| `-e, --env <pairs...>` | Lokal server uchun `KEY=VALUE` muhit o'zgaruvchilari |
| `-H, --header <pairs...>` | Masofaviy server uchun `KEY=VALUE` HTTP sarlavhalari |
| `--cwd <dir>` | Lokal server uchun ishchi papka |

## Boshqalar

### `atlas lang <lang>`

Interfeys tilini belgilash: `uz`, `ru` yoki `en`.

### `atlas statusline`

Claude Code'ning stdin'dagi JSON'idan status qatorini chiqaradi. Batafsil: [Status qatori](/guides/status-line/).

| Parametr | Tavsif |
|---|---|
| `--install <agent>` | Agent sozlamalariga o'rnatish (qo'llab-quvvatlanadi: `claude`) |
| `-y, --yes` | Sozlamalarni o'zgartirishdan oldin so'ramaslik |

### `atlas doctor`

Muhitni (Node, npm, git, bash, Python, sozlamalar yo'li) tekshiradi, terminal haqida aniqlangan ma'lumotni ko'rsatadi va har bir ulangan provayderni tekshiradi.

### `atlas help [command]`

Buyruq bo'yicha yordam.
