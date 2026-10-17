---
title: "Переменные окружения"
description: "Переменные, которые меняют, где The Atlas хранит данные, как рисует и какие ключи использует."
sidebar:
  order: 5
---

## The Atlas

| Переменная | Эффект |
|---|---|
| `ATLAS_HOME` | Папка данных вместо `~/.the-atlas` |
| `ATLAS_LANG` | Язык интерфейса (`uz`, `ru`, `en`), если он не сохранён через `atlas lang` |
| `ATLAS_KEEP_SCREEN` | Оставить чат на экране после выхода. По умолчанию экран и прокрутка очищаются |
| `ATLAS_NO_ANIM` | Вывести логотип сразу, без анимации печати |
| `ATLAS_ASCII` | Простые ASCII-символы и логотип в одну строку |
| `ATLAS_UNICODE` | Использовать Unicode-символы, даже если проверка считает, что шрифт их не нарисует |
| `ATLAS_FFMPEG` | Полный путь к `ffmpeg` для [голосового ввода](/ru/guides/voice/) |

Любое непустое значение включает флаг, например `ATLAS_ASCII=1`.

## Цвет

| Переменная | Эффект |
|---|---|
| `NO_COLOR` | Любое непустое значение выключает цвет |
| `FORCE_COLOR` | `0` выкл, `1` 16 цветов, `2` 256 цветов, `3` truecolor |

См. [Терминалы](/ru/getting-started/terminals/).

## Ключи провайдеров

Используются, только если в `config.json` нет сохранённого ключа для этого провайдера.

| Переменная | Провайдер |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter |
| `GEMINI_API_KEY` | Google Gemini |
| `GROQ_API_KEY` | Groq (также для голоса) |
| `CEREBRAS_API_KEY` | Cerebras |
| `MISTRAL_API_KEY` | Mistral |
| `GITHUB_TOKEN` | GitHub Models |
| `NVIDIA_API_KEY` | NVIDIA NIM |
| `SAMBANOVA_API_KEY` | SambaNova |
| `OMNIROUTE_API_KEY` | OmniRoute |
| `OPENAI_API_KEY` | OpenAI (также для голоса, если нет ключа Groq) |
| `ANTHROPIC_API_KEY` | Anthropic Claude |

Ollama ключ не нужен.

## Другие инструменты

| Переменная | Эффект |
|---|---|
| `CLAUDE_CONFIG_DIR` | Где `atlas statusline --install claude` ищет `settings.json` Claude Code (по умолчанию `~/.claude`) |

## Как задать переменную

```bash
# macOS, Linux: на один запуск
ATLAS_LANG=en atlas
# на всю сессию
export ATLAS_LANG=en
```

```powershell
# Windows PowerShell: на эту сессию
$env:ATLAS_LANG = "en"
# навсегда, для вашего пользователя
[Environment]::SetEnvironmentVariable("ATLAS_LANG", "en", "User")
```
