<!-- @format -->

# Contributing

Read [AGENTS.md](AGENTS.md) for conventions and [architecture](docs/architecture.md) for constraints and code ownership.

## Local setup

```bash
bun install
bun dev
```

Open <http://localhost:5173/tarralappu/>. Enter your OpenRouter API key in the app; never commit it.

## Before committing

```bash
bun format
bun test
bun run build
```

Build includes type checking and must report 0 errors/warnings; `bun check` runs the checker alone. Keep PRs focused; describe behavior changes, validation, and documentation impact. CI also checks formatting with `bun format:check`.

## Releases

`main` validates source without deploying. [Promote site](.github/workflows/promote.yml) alone manages artifact-only `beta`/`stable`; never merge source into them.

1. Merge matching release updates to [package.json](package.json) and [CHANGELOG.md](CHANGELOG.md) into `main`.
2. Run **Promote site** from **main**, action **beta**. Test the prerelease's attached site ZIP under `/tarralappu/`; `beta` is not a second Pages site.
3. Run it from **main**, action **stable**, with the exact tested `v<version>-beta.<run>.<attempt>` tag and explicit confirmation.

Promotion requires the current beta branch to match the candidate. It publishes the same files without rebuilding, verifies the Pages build, then creates `v<version>`. Existing stable tags are never replaced.
