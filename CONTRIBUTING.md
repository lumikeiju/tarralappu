<!-- @format -->

# Contributing

Tarralappu is a small, personal-but-public project. Contributions that keep its scope tight are welcome.

Read [AGENTS.md](AGENTS.md) first — it covers commits, versioning, formatting, and accessibility expectations.

## Local setup

```bash
bun install
bun run dev     # http://localhost:5173/tarralappu/
```

No backend, no environment variables — bring your own OpenRouter API key at runtime (entered in the app, never committed).

## Before committing

```bash
bun run check   # svelte-check, must be 0 errors / 0 warnings
bun run format  # prettier --write .
```

`bun run build` runs both `check` and the production bundle; it must also stay at 0 errors/warnings.

## In scope

- Bug fixes and accessibility fixes.
- Features consistent with the locked decisions in [`docs/implementation-plan.md`](docs/implementation-plan.md) (no backend, no free-form canvas, chain-locked model per row).
- UI/UX polish that keeps the sticky-note aesthetic and WCAG 2.2 AA conformance.

## Out of scope

- A backend, accounts, or multi-user support — this stays a client-only, bring-your-own-key tool.
- A draggable/free-form canvas layout — chains are a fixed, deterministic grid, by design.

## Common commit scopes

`board`, `sketch`, `chain`, `model`, `cost`, `prompt-board`, `a11y`, `docs`, `ci`.

## Releases

When a release-worthy change lands on `main`, run the [changelog prompt](.github/prompts/changelog.prompt.md) to prepend an entry to [`CHANGELOG.md`](CHANGELOG.md) and bump `version` in [`package.json`](package.json) (Conventional Commits + SemVer — see [AGENTS.md](AGENTS.md)).

## Pull requests

1. Branch `type/scope/short-description`.
2. Focused Conventional Commits.
3. `bun run check` and `bun run format`.
4. Open the PR with a description of the change and any docs impact.
