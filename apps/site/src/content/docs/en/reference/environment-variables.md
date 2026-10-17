---
title: "Environment variables"
description: "Variables that change where The Atlas stores data, how it draws, and which keys it uses."
sidebar:
  order: 5
---

## The Atlas

| Variable | Effect |
|---|---|
| `ATLAS_HOME` | Data folder instead of `~/.the-atlas` |
| `ATLAS_LANG` | Interface language (`uz`, `ru`, `en`) when none is saved with `atlas lang` |
| `ATLAS_KEEP_SCREEN` | Keep the chat on screen after quitting. By default the screen and scrollback are cleared |
| `ATLAS_NO_ANIM` | Print the logo at once, without the typing animation |
| `ATLAS_ASCII` | Plain ASCII glyphs and a one-line logo |
| `ATLAS_UNICODE` | Use Unicode glyphs even where detection says the font cannot draw them |
| `ATLAS_FFMPEG` | Full path to `ffmpeg` for [voice input](/en/guides/voice/) |

Any non-empty value turns a flag on, e.g. `ATLAS_ASCII=1`.

## Colour

| Variable | Effect |
|---|---|
| `NO_COLOR` | Any non-empty value turns colour off |
| `FORCE_COLOR` | `0` off, `1` 16 colours, `2` 256 colours, `3` truecolor |

See [Terminals](/en/getting-started/terminals/).

## Provider keys

Used only when no key for that provider is stored in `config.json`.

| Variable | Provider |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter |
| `GEMINI_API_KEY` | Google Gemini |
| `GROQ_API_KEY` | Groq (also used for voice) |
| `CEREBRAS_API_KEY` | Cerebras |
| `MISTRAL_API_KEY` | Mistral |
| `GITHUB_TOKEN` | GitHub Models |
| `NVIDIA_API_KEY` | NVIDIA NIM |
| `SAMBANOVA_API_KEY` | SambaNova |
| `OMNIROUTE_API_KEY` | OmniRoute |
| `OPENAI_API_KEY` | OpenAI (also used for voice when there is no Groq key) |
| `ANTHROPIC_API_KEY` | Anthropic Claude |

Ollama needs no key.

## Other tools

| Variable | Effect |
|---|---|
| `CLAUDE_CONFIG_DIR` | Where `atlas statusline --install claude` looks for Claude Code's `settings.json` (default `~/.claude`) |

## Setting a variable

```bash
# macOS, Linux: one run
ATLAS_LANG=en atlas
# for the session
export ATLAS_LANG=en
```

```powershell
# Windows PowerShell: this session
$env:ATLAS_LANG = "en"
# permanently, for your user
[Environment]::SetEnvironmentVariable("ATLAS_LANG", "en", "User")
```
