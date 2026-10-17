---
title: "Configuration files"
description: "What The Atlas stores in ~/.the-atlas and how to edit it."
sidebar:
  order: 4
---

Everything lives in one folder: `~/.the-atlas/` (on Windows `%USERPROFILE%\.the-atlas\`). Set `ATLAS_HOME` to use another folder. Nothing is stored anywhere else, except the Claude Code settings change made by `atlas statusline --install claude`.

| Path | Contents |
|---|---|
| `config.json` | Keys, default provider and models, fallback order, language, proxy token |
| `sessions/<id>.json` | Saved chats, one file each |
| `limits.json` | Today's request counters per provider |
| `mcp.json` | MCP servers |
| `voice.json` | Saved microphone |
| `agents.conf` | Your own agents, added to the catalog |
| `agents-state.json` | Agent usage counts, for sorting the picker |
| `cache/models-<provider>.json` | Model lists, cached for 6 hours |

Files that can hold secrets (`config.json`, `mcp.json`) are written with mode 600 on macOS and Linux. On Windows they inherit your user profile's permissions.

## config.json

Written by `atlas connect`, `atlas keys`, `atlas use`, `atlas lang`, `/model` and similar. You can also edit it by hand while The Atlas is not running.

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

| Field | Meaning |
|---|---|
| `keys` | API key per provider ID. Sent only to that provider |
| `baseURLs` | Override a provider's API URL, e.g. a remote OmniRoute or Ollama on another host |
| `models` | Default model per provider |
| `order` | Provider order for auto fallback. Providers not listed are tried after these |
| `provider` | Selected provider, or `auto` |
| `lang` | Interface language: `uz`, `ru` or `en`. Default `uz` |
| `system` | Optional custom system prompt. Replaces the built-in "You are Atlas" prompt |
| `serveToken` | Token for `atlas serve`, created on first use |

If the file is not valid JSON, The Atlas stops with "Config is corrupted" and the path. Fix or delete the file.

## sessions/

Each chat is saved after every answer as `<date>-<random>.json`, with its folder, title, model and messages. `/history` lists them; `/export` turns one into Markdown. Delete files to forget chats.

## limits.json

Request counters and the last rate-limit numbers seen per provider. Resets each day (UTC). Safe to delete. See [Free models](/en/guides/free-models/).

## mcp.json

MCP servers in Claude Desktop's `mcpServers` format. Managed with `atlas mcp`. See [MCP servers](/en/guides/mcp/).

## voice.json

The microphone chosen with `atlas voice device`. Delete it, or run `atlas voice device auto`, to use the system default.

## agents.conf

Your own agents, one per line, in the format of the bundled catalog:

```text
NAME|BINARY|COMMAND|INSTALL|DESCRIPTION|CATEGORY|AUTH|URL|WIN_INSTALL
```

Lines starting with `#` are comments. Agents are added to the bundled list; a name that already exists in the bundled catalog is ignored. See [AI agents launcher](/en/guides/agents/#add-your-own-agents).

## cache/

Model lists fetched from providers, refreshed after 6 hours. Safe to delete at any time.
