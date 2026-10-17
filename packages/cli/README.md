# ◆ The Atlas

**All AI assistants in one terminal.** Chat with free-tier models (OpenRouter, Gemini, Groq, Cerebras, Mistral, GitHub Models, NVIDIA, SambaNova, OmniRoute, Ollama) with automatic fallback, and launch 45+ AI coding agents — optionally running them on those free models.

```bash
npm i -g the-atlas
atlas keys add openrouter     # free key: https://openrouter.ai/keys
atlas                         # chat
```

## Commands

| Command | What it does |
|---|---|
| `atlas` | Interactive chat. `/help`, `/model groq/llama-3.3-70b-versatile`, `/provider auto`, `/models`, `/lang uz` |
| `atlas ask "…"` | One-shot answer; pipe-friendly: `git diff \| atlas ask "review"` |
| `atlas keys add\|list\|rm <provider>` | Keys are stored only in `~/.the-atlas/config.json`, typed hidden |
| `atlas providers` · `atlas models <p> --free` | Provider status · live model list |
| `atlas use <provider> [model]` | Default provider (`auto` = fallback chain) |
| `atlas agents` | Menu of 45+ AI CLIs: search, install, launch. **Tab** = run on Atlas free models |
| `atlas run aider --free` | Launch an agent wired to the local Atlas proxy |
| `atlas serve` | Local OpenAI-compatible endpoint (`127.0.0.1:4141/v1`, model `auto`) |
| `atlas doctor` | Check node/npm/git/bash/python and ping providers |

## How "auto" works

Providers are tried in order (`openrouter → gemini → groq → …`). On a rate limit, outage or bad key the next one answers — before the first token, so replies never mix.

## Free tiers — fair use

The Atlas uses **your own** keys. Free tiers are for personal use; do not share or resell keys.

---
🇺🇿 **O'zbekcha:** barcha AI yordamchilar bitta terminalda. `atlas lang uz` — interfeys o'zbek tilida.
🇷🇺 **Русский:** все ИИ-ассистенты в одном терминале. `atlas lang ru`.

MIT · agent catalog derived from [Aidevix CLI](https://github.com/SunnatbekYusupovTech/sunnatbeeCLI).
