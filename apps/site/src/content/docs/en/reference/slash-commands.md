---
title: "Slash commands"
description: "All commands you can type in the Atlas chat."
sidebar:
  order: 2
---

Type `/` in the chat to see them. Filter by typing, `Tab` completes, `Enter` runs.

| Command | Arguments | What it does |
|---|---|---|
| `/agent` | `<task>` | [Agent mode](/en/guides/agent-mode/): the AI edits files and runs commands, asking first |
| `/connect` | `[provider]` | Connect an AI; opens its key page, or OpenRouter sign-in |
| `/model` | `[provider/model]` | No argument: pick from a list. With one: set that model |
| `/compare` | `[ai ai ai] [question]` | [Ask 2 or 3 AIs at once](/en/guides/compare/) |
| `/voice` | | [Voice input](/en/guides/voice/), same as `ctrl+r` |
| `/agents` | | [Open one of 47 AI coding agents](/en/guides/agents/) |
| `/mcp` | | [MCP servers](/en/guides/mcp/) and their tools |
| `/history` | | Pick a saved chat and continue it |
| `/resume` | | Continue the last chat in this folder |
| `/export` | `[file]` | Save the chat as Markdown in the current folder |
| `/provider` | `<id>` or `auto` | Switch AI; `auto` turns fallback back on |
| `/omniroute` | | Start and connect local [OmniRoute](/en/guides/omniroute/) |
| `/clear` | | Start a new conversation |
| `/lang` | `uz`, `ru` or `en` | Interface language |
| `/help` | | All commands and keys |
| `/exit` | | Quit (also `/quit`) |

Examples:

```text
/model groq/llama-3.3-70b-versatile
/provider auto
/compare groq gemini what is a closure?
/export review-notes.md
/agent add a --dry-run flag to scripts/deploy.mjs
```

Provider IDs: `openrouter`, `gemini`, `groq`, `cerebras`, `mistral`, `github`, `nvidia`, `sambanova`, `omniroute`, `ollama`, `openai`, `anthropic`.
