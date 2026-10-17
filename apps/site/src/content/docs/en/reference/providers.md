---
title: "Providers"
description: "Every supported provider: ID, tier, default model, API URL and key variable."
sidebar:
  order: 6
---

All providers are reached through their OpenAI-compatible APIs.

| ID | Name | Tier | Default model | Base URL | Key variable |
|---|---|---|---|---|---|
| `openrouter` | OpenRouter | free | `openrouter/free` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `gemini` | Google Gemini | free | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` |
| `groq` | Groq | free | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| `cerebras` | Cerebras | free | `llama-3.3-70b` | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` |
| `mistral` | Mistral | free | `mistral-small-latest` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| `github` | GitHub Models | free | `openai/gpt-4.1-mini` | `https://models.github.ai/inference` | `GITHUB_TOKEN` |
| `nvidia` | NVIDIA NIM | free | `meta/llama-3.3-70b-instruct` | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` |
| `sambanova` | SambaNova | free | `Meta-Llama-3.3-70B-Instruct` | `https://api.sambanova.ai/v1` | `SAMBANOVA_API_KEY` |
| `omniroute` | OmniRoute | local | set in OmniRoute | `http://localhost:20128/v1` | `OMNIROUTE_API_KEY` (optional) |
| `ollama` | Ollama | local | `llama3.2` | `http://localhost:11434/v1` | none |
| `openai` | OpenAI | paid | `gpt-4.1-mini` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `anthropic` | Anthropic Claude | paid | `claude-sonnet-5-5` | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` |

**Free** means the provider has a free tier usable with a personal key. Limits are set by each provider and change over time.

## Key pages

| ID | Where to get a key |
|---|---|
| `openrouter` | [openrouter.ai/keys](https://openrouter.ai/keys), or one-click sign-in in `atlas connect` |
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

## Changing defaults

```bash
atlas use groq llama-3.3-70b-versatile     # default model for groq, and select groq
atlas models groq                          # see what else is available
```

To point a provider at another URL (for example Ollama on another machine), set `baseURLs` in [config.json](/en/reference/configuration/#configjson):

```json
{ "baseURLs": { "ollama": "http://192.168.1.20:11434/v1" } }
```
