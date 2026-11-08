<!-- @format -->

# AGENTS.md

Tarralappu: client-only Svelte 5 + TypeScript image-generation app using OpenRouter.

Read [architecture](docs/architecture.md) for constraints and code ownership; [contributor guide](CONTRIBUTING.md) for setup and release procedures.

- Prefer short Bun aliases. Validate code with `bun test` and `bun run build` (0 errors/warnings); format with `bun format` before committing. Keep `run` for build to avoid Bun's built-in bundler.
- Conventional Commits: `type(scope): description`. Branches: `type/scope/short-description`.
- Every development changeset updates [CHANGELOG.md](CHANGELOG.md). Keep its release version and [package.json](package.json) in sync using SemVer.
- UI must meet WCAG 2.2 AA.
- Long-form usage docs belong in [Silmärin](https://github.com/lumikeiju/silmarin), not READMEs.
- `main` holds source; `beta`/`stable` hold built files only. Never merge source into them. Manually promote tested beta artifacts without rebuilding; Pages serves `stable` root at `lumikeiju.dev/tarralappu/`.
