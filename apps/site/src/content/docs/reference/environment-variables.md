---
title: "Muhit o'zgaruvchilari"
description: "The Atlas ma'lumotlarni qayerda saqlashi, qanday chizishi va qaysi kalitlardan foydalanishini o'zgartiradigan o'zgaruvchilar."
sidebar:
  order: 5
---

## The Atlas

| O'zgaruvchi | Ta'siri |
|---|---|
| `ATLAS_HOME` | `~/.the-atlas` o'rniga ma'lumotlar papkasi |
| `ATLAS_LANG` | `atlas lang` bilan til saqlanmagan bo'lsa, interfeys tili (`uz`, `ru`, `en`) |
| `ATLAS_KEEP_SCREEN` | Chiqqandan keyin chat ekranda qoladi. Odatda ekran va scrollback tozalanadi |
| `ATLAS_NO_ANIM` | Logotipni yozilish animatsiyasisiz darhol chiqarish |
| `ATLAS_ASCII` | Oddiy ASCII belgilar va bir qatorli logotip |
| `ATLAS_UNICODE` | Aniqlash shrift chiza olmaydi desa ham Unicode belgilardan foydalanish |
| `ATLAS_FFMPEG` | [Ovozli kiritish](/guides/voice/) uchun `ffmpeg` ning to'liq yo'li |

Har qanday bo'sh bo'lmagan qiymat bayroqni yoqadi, masalan `ATLAS_ASCII=1`.

## Rang

| O'zgaruvchi | Ta'siri |
|---|---|
| `NO_COLOR` | Har qanday bo'sh bo'lmagan qiymat rangni o'chiradi |
| `FORCE_COLOR` | `0` o'chiq, `1` 16 rang, `2` 256 rang, `3` truecolor |

Batafsil: [Terminallar](/getting-started/terminals/).

## Provayder kalitlari

Faqat `config.json` da shu provayder uchun kalit saqlanmagan bo'lsa ishlatiladi.

| O'zgaruvchi | Provayder |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter |
| `GEMINI_API_KEY` | Google Gemini |
| `GROQ_API_KEY` | Groq (ovoz uchun ham ishlatiladi) |
| `CEREBRAS_API_KEY` | Cerebras |
| `MISTRAL_API_KEY` | Mistral |
| `GITHUB_TOKEN` | GitHub Models |
| `NVIDIA_API_KEY` | NVIDIA NIM |
| `SAMBANOVA_API_KEY` | SambaNova |
| `OMNIROUTE_API_KEY` | OmniRoute |
| `OPENAI_API_KEY` | OpenAI (Groq kaliti bo'lmasa, ovoz uchun ham ishlatiladi) |
| `ANTHROPIC_API_KEY` | Anthropic Claude |

Ollama'ga kalit kerak emas.

## Boshqa vositalar

| O'zgaruvchi | Ta'siri |
|---|---|
| `CLAUDE_CONFIG_DIR` | `atlas statusline --install claude` Claude Code'ning `settings.json` faylini qayerdan qidirishi (standart `~/.claude`) |

## O'zgaruvchini o'rnatish

```bash
# macOS, Linux: one run
ATLAS_LANG=en atlas
# for the session
export ATLAS_LANG=en
```

```powershell
# Windows PowerShell: this session
$env:ATLAS_LANG = "en"
# permanently, for your user
[Environment]::SetEnvironmentVariable("ATLAS_LANG", "en", "User")
```
