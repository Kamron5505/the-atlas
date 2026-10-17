---
title: "Слэш-команды"
description: "Все команды, которые можно ввести в чате Atlas."
sidebar:
  order: 2
---

Введите `/` в чате, чтобы их увидеть. Печатайте для фильтра, `Tab` дополняет, `Enter` запускает.

| Команда | Аргументы | Что делает |
|---|---|---|
| `/agent` | `<task>` | [Режим агента](/ru/guides/agent-mode/): ИИ правит файлы и запускает команды, сначала спрашивая |
| `/connect` | `[provider]` | Подключить ИИ; открывает страницу ключей или вход в OpenRouter |
| `/model` | `[provider/model]` | Без аргумента: выбор из списка. С аргументом: задать эту модель |
| `/compare` | `[ai ai ai] [question]` | [Спросить 2 или 3 ИИ сразу](/ru/guides/compare/) |
| `/voice` | | [Голосовой ввод](/ru/guides/voice/), то же, что `ctrl+r` |
| `/agents` | | [Открыть один из 47 ИИ-агентов для кода](/ru/guides/agents/) |
| `/mcp` | | [MCP-серверы](/ru/guides/mcp/) и их инструменты |
| `/history` | | Выбрать сохранённый чат и продолжить его |
| `/resume` | | Продолжить последний чат в этой папке |
| `/export` | `[file]` | Сохранить чат в Markdown в текущей папке |
| `/provider` | `<id>` или `auto` | Сменить ИИ; `auto` снова включает переключение |
| `/omniroute` | | Запустить и подключить локальный [OmniRoute](/ru/guides/omniroute/) |
| `/clear` | | Начать новый разговор |
| `/lang` | `uz`, `ru` или `en` | Язык интерфейса |
| `/help` | | Все команды и клавиши |
| `/exit` | | Выйти (также `/quit`) |

Примеры:

```text
/model groq/llama-3.3-70b-versatile
/provider auto
/compare groq gemini what is a closure?
/export review-notes.md
/agent add a --dry-run flag to scripts/deploy.mjs
```

ID провайдеров: `openrouter`, `gemini`, `groq`, `cerebras`, `mistral`, `github`, `nvidia`, `sambanova`, `omniroute`, `ollama`, `openai`, `anthropic`.
