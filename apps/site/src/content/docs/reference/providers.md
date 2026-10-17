---
title: "Provayderlar"
description: "Qo'llab-quvvatlanadigan barcha provayderlar: ID, tarif, standart model, API URL va kalit o'zgaruvchisi."
sidebar:
  order: 6
---

Barcha provayderlarga ularning OpenAI'ga mos API'lari orqali ulaniladi.

| ID | Nomi | Tarif | Standart model | Bazaviy URL | Kalit o'zgaruvchisi |
|---|---|---|---|---|---|
| `openrouter` | OpenRouter | bepul | `openrouter/free` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `gemini` | Google Gemini | bepul | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` |
| `groq` | Groq | bepul | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| `cerebras` | Cerebras | bepul | `llama-3.3-70b` | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` |
| `mistral` | Mistral | bepul | `mistral-small-latest` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| `github` | GitHub Models | bepul | `openai/gpt-4.1-mini` | `https://models.github.ai/inference` | `GITHUB_TOKEN` |
| `nvidia` | NVIDIA NIM | bepul | `meta/llama-3.3-70b-instruct` | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` |
| `sambanova` | SambaNova | bepul | `Meta-Llama-3.3-70B-Instruct` | `https://api.sambanova.ai/v1` | `SAMBANOVA_API_KEY` |
| `omniroute` | OmniRoute | lokal | OmniRoute'da belgilanadi | `http://localhost:20128/v1` | `OMNIROUTE_API_KEY` (ixtiyoriy) |
| `ollama` | Ollama | lokal | `llama3.2` | `http://localhost:11434/v1` | yo'q |
| `openai` | OpenAI | pullik | `gpt-4.1-mini` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `anthropic` | Anthropic Claude | pullik | `claude-sonnet-5-5` | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` |

**Bepul** degani provayderda shaxsiy kalit bilan ishlatsa bo'ladigan bepul tarif bor. Limitlarni har bir provayder o'zi belgilaydi va ular vaqt o'tishi bilan o'zgaradi.

## Kalit sahifalari

| ID | Kalitni qayerdan olish |
|---|---|
| `openrouter` | [openrouter.ai/keys](https://openrouter.ai/keys) yoki `atlas connect` da bir bosishda kirish |
| `gemini` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `groq` | [console.groq.com/keys](https://console.groq.com/keys) |
| `cerebras` | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| `mistral` | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| `github` | [github.com/settings/tokens](https://github.com/settings/tokens) |
| `nvidia` | [build.nvidia.com](https://build.nvidia.com) |
| `sambanova` | [cloud.sambanova.ai/apis](https://cloud.sambanova.ai/apis) |
| `omniroute` | [github.com/diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) |
| `ollama` | [ollama.com/download](https://ollama.com/download) |
| `openai` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `anthropic` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

## Standartlarni o'zgartirish

```bash
atlas use groq llama-3.3-70b-versatile     # default model for groq, and select groq
atlas models groq                          # see what else is available
```

Provayderni boshqa URL'ga yo'naltirish uchun (masalan, boshqa kompyuterdagi Ollama) [config.json](/reference/configuration/#configjson) da `baseURLs` ni o'rnating:

```json
{ "baseURLs": { "ollama": "http://192.168.1.20:11434/v1" } }
```
