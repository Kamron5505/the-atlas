---
title: "Файлы настроек"
description: "Что The Atlas хранит в ~/.the-atlas и как это править."
sidebar:
  order: 4
---

Всё хранится в одной папке: `~/.the-atlas/` (на Windows `%USERPROFILE%\.the-atlas\`). Задайте `ATLAS_HOME`, чтобы использовать другую папку. Больше ничего нигде не хранится, кроме изменения настроек Claude Code, которое делает `atlas statusline --install claude`.

| Путь | Содержимое |
|---|---|
| `config.json` | Ключи, провайдер и модели по умолчанию, порядок переключения, язык, токен прокси |
| `sessions/<id>.json` | Сохранённые чаты, по файлу на чат |
| `limits.json` | Счётчики запросов за сегодня по провайдерам |
| `mcp.json` | MCP-серверы |
| `voice.json` | Сохранённый микрофон |
| `agents.conf` | Ваши агенты, добавляются в каталог |
| `agents-state.json` | Сколько раз запускался каждый агент, для сортировки в окне выбора |
| `cache/models-<provider>.json` | Списки моделей, кэш на 6 часов |

Файлы, где могут быть секреты (`config.json`, `mcp.json`), записываются с правами 600 на macOS и Linux. На Windows они наследуют права вашего профиля.

## config.json

Записывается командами `atlas connect`, `atlas keys`, `atlas use`, `atlas lang`, `/model` и похожими. Его можно править и вручную, пока The Atlas не запущен.

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

| Поле | Значение |
|---|---|
| `keys` | API-ключ для каждого ID провайдера. Отправляется только этому провайдеру |
| `baseURLs` | Другой URL API провайдера, например удалённый OmniRoute или Ollama на другом компьютере |
| `models` | Модель по умолчанию для каждого провайдера |
| `order` | Порядок провайдеров для auto-переключения. Провайдеры не из списка пробуются после них |
| `provider` | Выбранный провайдер или `auto` |
| `lang` | Язык интерфейса: `uz`, `ru` или `en`. По умолчанию `uz` |
| `system` | Необязательный свой системный промпт. Заменяет встроенный промпт «You are Atlas» |
| `serveToken` | Токен для `atlas serve`, создаётся при первом использовании |

Если файл не является корректным JSON, The Atlas останавливается с сообщением «Config is corrupted» и путём к файлу. Исправьте или удалите файл.

## sessions/

Каждый чат сохраняется после каждого ответа как `<date>-<random>.json`: папка, заголовок, модель и сообщения. `/history` показывает их список; `/export` превращает чат в Markdown. Удалите файлы, чтобы забыть чаты.

## limits.json

Счётчики запросов и последние значения rate-limit по каждому провайдеру. Сбрасывается каждый день (UTC). Можно спокойно удалить. См. [Бесплатные модели](/ru/guides/free-models/).

## mcp.json

MCP-серверы в формате `mcpServers` от Claude Desktop. Управляется через `atlas mcp`. См. [MCP-серверы](/ru/guides/mcp/).

## voice.json

Микрофон, выбранный через `atlas voice device`. Удалите файл или выполните `atlas voice device auto`, чтобы вернуть системный по умолчанию.

## agents.conf

Ваши агенты, по одному в строке, в формате встроенного каталога:

```text
NAME|BINARY|COMMAND|INSTALL|DESCRIPTION|CATEGORY|AUTH|URL|WIN_INSTALL
```

Строки, начинающиеся с `#`, это комментарии. Агенты добавляются к встроенному списку; имя, которое уже есть во встроенном каталоге, игнорируется. См. [Запуск ИИ-агентов](/ru/guides/agents/#добавить-своих-агентов).

## cache/

Списки моделей, полученные от провайдеров, обновляются через 6 часов. Можно удалить в любой момент.
