---
title: "CLI commands"
description: "Every atlas command and option."
sidebar:
  order: 1
---

`atlas --help` and `atlas <command> --help` print the same information. Global options: `-v, --version`, `-h, --help`.

## Chat and answers

### `atlas chat`

Interactive chat. This is the default command, so `atlas` alone runs it.

| Option | Description |
|---|---|
| `-p, --provider <id>` | Provider ID or `auto` |
| `-m, --model <model>` | Model ID (with a fixed provider) |
| `-c, --continue` | Continue the last chat in this folder |

Needs an interactive terminal; in scripts use `atlas ask`.

### `atlas ask [prompt...]`

One-shot answer to stdout. Piped stdin is appended to the prompt as context.

| Option | Description |
|---|---|
| `-p, --provider <id>` | Provider ID or `auto` |
| `-m, --model <model>` | Model ID |
| `-s, --system <text>` | System prompt |

```bash
atlas ask "explain this error" < build.log
git diff | atlas ask "write a commit message"
```

Fallback notices go to stderr, so stdout holds only the answer.

### `atlas agent <task...>`

[Agent mode](/en/guides/agent-mode/): the AI reads and edits files and runs commands in the current folder, asking before changes.

| Option | Description |
|---|---|
| `-p, --provider <id>` | Provider ID or `auto` |
| `-m, --model <model>` | Model ID |

Exits with code 1 if the agent fails.

### `atlas voice`

Record once, print the recognized text. See [Voice input](/en/guides/voice/).

| Option | Description |
|---|---|
| `-d, --device <name>` | Microphone name or number (see `atlas voice devices`) |
| `-s, --seconds <n>` | Maximum recording length, default `120` |
| `-l, --lang <lang>` | Speech language hint: `uz`, `ru` or `en` |

| Subcommand | Description |
|---|---|
| `atlas voice devices` | List microphones; the saved one is marked |
| `atlas voice device <name\|index>` | Remember a microphone: number from the list, name, or `auto` |

## Providers and keys

### `atlas connect [provider]`

Connect wizard: pick an AI, the browser opens, paste the key, it is verified. OpenRouter uses one-click browser sign-in.

### `atlas keys`

| Subcommand | Description |
|---|---|
| `atlas keys add <provider> [key]` | Add or replace a key. Omit `key` to type it hidden |
| `atlas keys list` | Show stored keys, masked |
| `atlas keys rm <provider>` | Remove a key |

### `atlas providers`

List all providers with their status (ready, no key, local), tier and key page.

### `atlas models [provider]`

List live models of a provider. Default provider: `openrouter`.

| Option | Description |
|---|---|
| `-f, --free` | Only free models |
| `--json` | JSON output |

### `atlas use <provider> [model]`

Set the default provider (`auto` for the fallback chain) and, optionally, its default model.

```bash
atlas use auto
atlas use groq llama-3.3-70b-versatile
```

### `atlas omniroute`

Install, start and connect the local [OmniRoute](/en/guides/omniroute/) gateway.

| Option | Description |
|---|---|
| `--url <url>` | Use a remote OmniRoute instead, e.g. `https://gw.example.com/v1` |
| `--key <key>` | API key for a remote OmniRoute |

### `atlas serve`

Local OpenAI-compatible endpoint with free-model fallback. See [Local proxy](/en/guides/serve/).

| Option | Description |
|---|---|
| `--port <n>` | Port, default `4141` |

## Agents

### `atlas agents`

Pick, install and launch AI CLI agents. See [AI agents launcher](/en/guides/agents/).

| Option | Description |
|---|---|
| `-l, --list` | Print the catalog |
| `-f, --free` | Only free agents |
| `-i, --installed` | Only installed agents |

### `atlas run <agent> [args...]`

Launch an agent by name or command; installs it if missing. Extra `args` are passed to the agent.

| Option | Description |
|---|---|
| `--free` | Route the agent through Atlas free models |
| `-w, --window` | Open in a new terminal window |
| `-y, --yes` | Install without asking |

### `atlas install <agent>`

Install an agent.

| Option | Description |
|---|---|
| `-y, --yes` | Do not ask |

## MCP

### `atlas mcp`

Manage [MCP servers](/en/guides/mcp/) (external tools for agent mode).

| Subcommand | Description |
|---|---|
| `atlas mcp list` | Servers, their status and tool count |
| `atlas mcp add <name> [command...]` | Add a server: a preset name, `--url <url>`, or `-- <command> [args...]` |
| `atlas mcp remove <name>` | Remove a server (alias `rm`) |
| `atlas mcp enable <name>` | Enable a server |
| `atlas mcp disable <name>` | Disable a server without removing it |
| `atlas mcp tools <name>` | Connect to a server and list its tools |
| `atlas mcp import <source>` | Import servers from another app (`claude` = Claude Desktop) |

Options of `atlas mcp add`:

| Option | Description |
|---|---|
| `--url <url>` | Remote server URL (Streamable HTTP or SSE) |
| `-e, --env <pairs...>` | Environment variables `KEY=VALUE` for a local server |
| `-H, --header <pairs...>` | HTTP headers `KEY=VALUE` for a remote server |
| `--cwd <dir>` | Working directory for a local server |

## Other

### `atlas lang <lang>`

Set the interface language: `uz`, `ru` or `en`.

### `atlas statusline`

Print a status line from Claude Code's JSON on stdin. See [Status line](/en/guides/status-line/).

| Option | Description |
|---|---|
| `--install <agent>` | Install into an agent's settings (supported: `claude`) |
| `-y, --yes` | Do not ask before changing settings |

### `atlas doctor`

Check the environment (Node, npm, git, bash, Python, config path), show what was detected about the terminal, and ping every connected provider.

### `atlas help [command]`

Help for a command.
