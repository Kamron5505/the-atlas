---
title: "Changelog"
description: "Changes in each release of The Atlas."
sidebar:
  order: 3
---

## v0.1.0 (unreleased)

First release.

### Chat

- Interactive chat (`atlas`) with streaming Markdown answers, neon-blue UI and a typed ATLAS logo.
- Slash command menu, `↑` `↓` input history, `Esc` to stop an answer.
- `@file` attachments: text files, images and folder listings.
- Saved chats: `/history`, `/resume`, `atlas -c`, `/export` to Markdown.
- `/compare`: ask 2 or 3 AIs at once and keep the best answer.
- Status line: repo, branch, context usage, cost, changed lines, model and free requests left.
- Interface in Uzbek (default), Russian and English: `/lang`, `atlas lang`.
- Plain ASCII and reduced-colour fallbacks for legacy terminals; no emoji in the UI chrome.

### Models and providers

- 12 providers: OpenRouter, Gemini, Groq, Cerebras, Mistral, GitHub Models, NVIDIA NIM, SambaNova, OmniRoute, Ollama, OpenAI, Anthropic.
- Auto mode: falls back to other free models and providers before the first token; local servers that are not running are skipped silently.
- One-click OpenRouter sign-in (OAuth with PKCE); connect wizard for other providers with key verification.
- Model picker, free-limit counter and a menu to switch AI when a limit is reached.
- `atlas omniroute` installs, starts and connects the OmniRoute gateway.
- `atlas ask` for one-shot, pipe-friendly answers.
- `atlas serve`: local OpenAI-compatible endpoint with fallback.

### Agents and tools

- Agent mode (`atlas agent`, `/agent`): read, search, edit and run commands in the project, with approval for every change, project-only paths and blocked secret files.
- MCP servers: presets, custom local and remote servers, `atlas mcp import claude`; every MCP tool call needs approval.
- Voice input with `ctrl+r` and `atlas voice` (ffmpeg + Groq Whisper).
- Launcher for 47 AI CLI agents (`atlas agents`, `atlas run`): installs on Windows, macOS and Linux, opens agents in a new terminal window, `--free` runs them on Atlas free models.
- `atlas statusline --install claude` puts the Atlas status line into Claude Code.
- `atlas doctor` checks the environment, terminal and providers.

### Fixes before release

- Windows: agents installed by npm failed to launch (`ENOENT`); only `.exe`, `.cmd` and `.bat` shims are used now.
- OpenRouter free models that stopped being free (404) or were busy (429) no longer end the answer; other free models are tried.
- One busy free model no longer marks the whole provider as out of quota.
- Models answer as Atlas instead of naming the underlying model.
- The screen is cleared on exit like `cls` (`ATLAS_KEEP_SCREEN=1` keeps it).
