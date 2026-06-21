<!-- @format -->

# Contributing

Peruskivi is small and intentionally generic. Contributions that keep that focus are welcome.

Read [AGENTS.md](AGENTS.md) first — it covers commits, versioning, formatting, and accessibility expectations that apply here too.

## Local setup

```powershell
bun install
bun run format
```

There is no build step.

## In scope

- Tighten AI agent customization files in `.github/`.
- Improve boilerplate docs as starting points.
- Update formatting / editor config as Lumikeiju conventions evolve.

## Out of scope

- Adding a specific tech stack, deploy workflow, or bootstrap script. Each cloned project picks its own.

## Common commit scopes

`template`, `instructions`, `agents`, `prompts`, `docs`, `ci`, `a11y`.

## Releases

When a release-worthy change lands on `main`, run the [changelog prompt](.github/prompts/changelog.prompt.md) to prepend an entry to [`CHANGELOG.md`](CHANGELOG.md) and bump the `version` in [`package.json`](package.json).

## Pull requests

1. Branch `type/scope/short-description`.
2. Focused Conventional Commits.
3. `bun run format`.
4. Open the PR with a description of the change and any docs impact.
