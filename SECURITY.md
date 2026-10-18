# Security

Report vulnerabilities **privately**: [Security → Report a vulnerability](https://github.com/Kamron5505/the-atlas/security/advisories/new). Please don't open a public issue.

Include the Atlas version, OS, steps to reproduce and the impact. Never include real API keys.

## What Atlas protects

- Keys, chats and settings stay in `~/.the-atlas/` (owner-only permissions on macOS/Linux). Atlas has no server.
- Agent mode can only touch files inside the project folder; `.env*`, private keys and `~/.ssh` are refused. Writes, commands and every MCP tool need your approval.
- `atlas serve` listens on `127.0.0.1` only and requires a token; `atlas run --free` checks the server's identity before sending it the token.
- OpenRouter sign-in uses OAuth PKCE with a loopback-only callback.
