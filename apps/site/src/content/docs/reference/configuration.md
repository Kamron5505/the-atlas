---
title: "Sozlamalar fayllari"
description: "The Atlas ~/.the-atlas papkasida nimalarni saqlaydi va ularni qanday tahrirlash mumkin."
sidebar:
  order: 4
---

Hammasi bitta papkada: `~/.the-atlas/` (Windows'da `%USERPROFILE%\.the-atlas\`). Boshqa papkadan foydalanish uchun `ATLAS_HOME` ni o'rnating. `atlas statusline --install claude` qiladigan Claude Code sozlamasi o'zgarishidan boshqa hech narsa boshqa joyda saqlanmaydi.

| Yo'l | Mazmuni |
|---|---|
| `config.json` | Kalitlar, standart provayder va modellar, almashish tartibi, til, proksi tokeni |
| `sessions/<id>.json` | Saqlangan chatlar, har biri alohida faylda |
| `limits.json` | Provayderlar bo'yicha bugungi so'rov hisoblagichlari |
| `mcp.json` | MCP serverlar |
| `voice.json` | Saqlangan mikrofon |
| `agents.conf` | Katalogga qo'shilgan o'z agentlaringiz |
| `agents-state.json` | Tanlash oynasini saralash uchun agentlardan foydalanish soni |
| `cache/models-<provider>.json` | 6 soatga keshlangan modellar ro'yxati |

Maxfiy ma'lumot saqlashi mumkin bo'lgan fayllar (`config.json`, `mcp.json`) macOS va Linux'da 600 huquqi bilan yoziladi. Windows'da ular foydalanuvchi profilingiz huquqlarini meros qilib oladi.

## config.json

`atlas connect`, `atlas keys`, `atlas use`, `atlas lang`, `/model` va shunga o'xshashlar yozadi. The Atlas ishlamayotganda uni qo'lda ham tahrirlashingiz mumkin.

```json
{
  "keys": { "openrouter": "sk-or-...", "groq": "gsk_..." },
  "baseURLs": { "omniroute": "https://gw.example.com/v1" },
  "models": { "groq": "llama-3.3-70b-versatile" },
  "order": ["openrouter", "gemini", "groq", "cerebras", "mistral", "github", "nvidia", "sambanova", "omniroute", "ollama"],
  "provider": "auto",
  "lang": "en",
  "system": "You are a concise assistant.",
  "serveToken": "atlas-..."
}
```

| Maydon | Ma'nosi |
|---|---|
| `keys` | Har bir provayder ID uchun API kalit. Faqat o'sha provayderga yuboriladi |
| `baseURLs` | Provayder API URL'ini almashtirish, masalan masofaviy OmniRoute yoki boshqa kompyuterdagi Ollama |
| `models` | Har bir provayderning standart modeli |
| `order` | Auto almashish uchun provayderlar tartibi. Ro'yxatda yo'qlari bulardan keyin sinab ko'riladi |
| `provider` | Tanlangan provayder yoki `auto` |
| `lang` | Interfeys tili: `uz`, `ru` yoki `en`. Standart `uz` |
| `system` | Ixtiyoriy maxsus tizim prompti. Ichki "You are Atlas" promptini almashtiradi |
| `serveToken` | `atlas serve` uchun token, birinchi foydalanishda yaratiladi |

Agar fayl to'g'ri JSON bo'lmasa, The Atlas "Config is corrupted" xabari va yo'l bilan to'xtaydi. Faylni tuzating yoki o'chiring.

## sessions/

Har bir chat har javobdan keyin papkasi, sarlavhasi, modeli va xabarlari bilan `<date>-<random>.json` ko'rinishida saqlanadi. `/history` ularni ko'rsatadi; `/export` birini Markdown'ga aylantiradi. Chatlarni unutish uchun fayllarni o'chiring.

## limits.json

Har bir provayder uchun so'rov hisoblagichlari va oxirgi ko'rilgan rate-limit raqamlari. Har kuni (UTC) nolga tushadi. O'chirsa bo'ladi. Batafsil: [Bepul modellar](/guides/free-models/).

## mcp.json

Claude Desktop'ning `mcpServers` formatidagi MCP serverlar. `atlas mcp` bilan boshqariladi. Batafsil: [MCP serverlar](/guides/mcp/).

## voice.json

`atlas voice device` bilan tanlangan mikrofon. Tizimdagi standart mikrofonga qaytish uchun faylni o'chiring yoki `atlas voice device auto` ni ishga tushiring.

## agents.conf

O'z agentlaringiz, har qatorda bittadan, ichki katalog formatida:

```text
NAME|BINARY|COMMAND|INSTALL|DESCRIPTION|CATEGORY|AUTH|URL|WIN_INSTALL
```

`#` bilan boshlanadigan qatorlar izoh hisoblanadi. Agentlar ichki ro'yxatga qo'shiladi; ichki katalogda mavjud nom e'tiborga olinmaydi. Batafsil: [AI agentlar ishga tushirgichi](/guides/agents/#oz-agentlaringizni-qoshish).

## cache/

Provayderlardan olingan modellar ro'yxati, 6 soatdan keyin yangilanadi. Istalgan vaqtda o'chirsa bo'ladi.
