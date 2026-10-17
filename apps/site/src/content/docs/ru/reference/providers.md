---
title: "Провайдеры"
description: "Все поддерживаемые провайдеры: ID, тариф, модель по умолчанию, URL API и переменная ключа."
sidebar:
  order: 6
---

Все провайдеры подключаются через их OpenAI-совместимые API.

| ID | Название | Тариф | Модель по умолчанию | Базовый URL | Переменная ключа |
|---|---|---|---|---|---|
| `openrouter` | OpenRouter | бесплатно | `openrouter/free` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `gemini` | Google Gemini | бесплатно | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` |
| `groq` | Groq | бесплатно | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| `cerebras` | Cerebras | бесплатно | `llama-3.3-70b` | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` |
| `mistral` | Mistral | бесплатно | `mistral-small-latest` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| `github` | GitHub Models | бесплатно | `openai/gpt-4.1-mini` | `https://models.github.ai/inference` | `GITHUB_TOKEN` |
| `nvidia` | NVIDIA NIM | бесплатно | `meta/llama-3.3-70b-instruct` | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` |
| `sambanova` | SambaNova | бесплатно | `Meta-Llama-3.3-70B-Instruct` | `https://api.sambanova.ai/v1` | `SAMBANOVA_API_KEY` |
| `omniroute` | OmniRoute | локально | задаётся в OmniRoute | `http://localhost:20128/v1` | `OMNIROUTE_API_KEY` (необязательно) |
| `ollama` | Ollama | локально | `llama3.2` | `http://localhost:11434/v1` | нет |
| `openai` | OpenAI | платно | `gpt-4.1-mini` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `anthropic` | Anthropic Claude | платно | `claude-sonnet-5-5` | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` |

**Бесплатно** значит, что у провайдера есть бесплатный тариф для личного ключа. Лимиты задаёт каждый провайдер, и они со временем меняются.

## Страницы ключей

| ID | Где взять ключ |
|---|---|
| `openrouter` | [openrouter.ai/keys](https://openrouter.ai/keys) или вход в один клик в `atlas connect` |
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

## Изменение значений по умолчанию

```bash
atlas use groq llama-3.3-70b-versatile     # модель по умолчанию для groq, и выбрать groq
atlas models groq                          # посмотреть, что ещё доступно
```

Чтобы направить провайдера на другой URL (например, Ollama на другом компьютере), задайте `baseURLs` в [config.json](/ru/reference/configuration/#configjson):

```json
{ "baseURLs": { "ollama": "http://192.168.1.20:11434/v1" } }
```
