---
title: "Feedback"
description: "Report bugs, request features, ask questions, and report security issues privately."
sidebar:
  order: 4
---

## Report a bug

[Open a bug report](https://github.com/Kamron5505/the-atlas/issues/new?labels=bug) on GitHub. Search [existing issues](https://github.com/Kamron5505/the-atlas/issues) first.

Include:

1. **What you did**: the exact command or slash command.
2. **What happened** and **what you expected**. Paste the error text, not a screenshot of it.
3. **Versions**: `atlas --version` and `node --version`.
4. **Environment**: the output of `atlas doctor`. It shows your OS, terminal, colour support and which providers answer.
5. **Provider and model**, if the problem is with answers: shown in the status line or under the answer.

:::caution[Remove secrets before posting]
`atlas doctor` does not print your keys, but check everything you paste. Never post the contents of `~/.the-atlas/config.json` or `mcp.json`, API keys, `serveToken`, or MCP tokens. Keys usually start with `sk-`, `gsk_`, `ghp_`, `github_pat_` or `AIza`. If you posted one by mistake, revoke it on the provider's key page.
:::

## Request a feature

[Open a feature request](https://github.com/Kamron5505/the-atlas/issues/new?labels=feature). Describe the problem first, then the change you would like. One idea per issue.

## Ask a question

Use [GitHub Discussions](https://github.com/Kamron5505/the-atlas/discussions) for questions, setups you want to share, and ideas that need discussion first.

## Report a security issue

Do **not** open a public issue. Report it privately through [GitHub security advisories](https://github.com/Kamron5505/the-atlas/security/advisories/new). Include the steps to reproduce and what an attacker could do. Examples: a way for agent mode to write outside the project or read a secret file, a tool running without approval, or a key sent somewhere other than its provider.
