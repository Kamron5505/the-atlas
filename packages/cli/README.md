# ◆ The Atlas

[![npm](https://img.shields.io/npm/v/the-atlas?color=00E5FF&label=npm)](https://www.npmjs.com/package/the-atlas) [![CI](https://github.com/Kamron5505/the-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/Kamron5505/the-atlas/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-2F7BFF)](LICENSE)

**All AI assistants in one terminal.** Free models with automatic switching, 47 AI coding agents, agent mode, MCP tools and voice input.

```bash
npm i -g the-atlas   # Node.js 22+
atlas
```

On first run pick **OpenRouter**: the browser opens, you sign in, the key arrives by itself. No copy-paste.

**Docs:** https://kamron5505.github.io/the-atlas/ · O'zbekcha (default) · [Русский](https://kamron5505.github.io/the-atlas/ru/) · [English](https://kamron5505.github.io/the-atlas/en/)

## What you get

| | |
|---|---|
| **Free models, auto-switch** | OpenRouter, Gemini, Groq, Cerebras, Mistral, GitHub Models, NVIDIA, SambaNova, OmniRoute, Ollama. A busy or rate-limited model is skipped; the next one answers. |
| **Agent mode** | `/agent <task>` reads and edits project files and runs commands. Every change shows a diff and asks first. |
| **47 AI agents** | `/agents` installs and opens Claude Code, Codex, Gemini CLI, Aider and more in a new terminal window. |
| **MCP tools** | `atlas mcp add filesystem` (also github, browser, memory…), or import from Claude Desktop. |
| **Voice** | `ctrl+r`, speak, Enter. Groq Whisper (free key). |
| **Compare** | `/compare` asks 2-3 AIs at once and shows the fastest. |
| **History** | Chats are saved locally: `/history`, `/resume`, `atlas -c`, `/export`. |
| **Status line** | Repo, branch, context bar, cost, model. Also for Claude Code: `atlas statusline --install claude`. |

## Commands

```text
atlas                      chat (default)
atlas ask "…"              one answer to stdout (pipe-friendly)
atlas agent "…"            agent mode in this folder
atlas connect [provider]   connect an AI
atlas agents               launcher for 47 AI CLIs
atlas mcp …                MCP servers
atlas voice                speak → text
atlas serve                local OpenAI-compatible endpoint
atlas doctor               check environment, terminal and providers
```

In chat type `/` for all commands, `@path` to attach a file, `↑↓` for history, `Esc` to stop.

## Privacy

Keys, chats and settings stay on your computer in `~/.the-atlas/`. Atlas has no server and sends nothing except your requests to the AI you chose.

## Development

```bash
npm ci
npm run typecheck && npx vitest run && npm run build
npm run site:dev            # docs site
```

MIT · Agent catalog derived from [Aidevix CLI](https://github.com/SunnatbekYusupovTech/sunnatbeeCLI).
