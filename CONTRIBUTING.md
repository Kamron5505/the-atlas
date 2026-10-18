# Contributing

```bash
git clone https://github.com/Kamron5505/the-atlas && cd the-atlas
npm ci
npm run build && npm link -w the-atlas   # `atlas` now runs your code
```

Before a pull request:

```bash
npm run typecheck
npx vitest run
npm run site:build      # if you touched apps/site
```

Rules (details in [CLAUDE.md](CLAUDE.md)):

- Every user-facing string in Uzbek (default), Russian and English.
- No emoji in UI chrome; colours only from the neon tokens.
- Tests never hit real networks or paid APIs — mock `fetch`.
- Never put API keys in code, tests or the package.
- New agent in the catalog: add a line to `packages/cli/agents.conf`, run `npm run check:agents` and `npm run site:agents`.
