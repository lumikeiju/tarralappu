<!-- @format -->

# AGENTS.md

Single source of truth for repository conventions. Read before editing.

## Repo identity

**Peruskivi** is a starter template for Lumikeiju's new project repositories. It ships scaffolding (license, formatting, editor config, AI agent customization, CI config, boilerplate docs) and no tech stack. The cloned project picks the stack.

## Apex vs standalone

Every project surfaces on `lumikeiju.dev` in **exactly one** of two ways:

- **Apex mini-page** — `internal` registry entry on [`lumikeiju.github.io`](https://github.com/lumikeiju/lumikeiju.github.io). Project repo must **not** enable GitHub Pages.
- **Standalone site** — project repo builds and hosts at `lumikeiju.dev/<slug>/` via GitHub Pages. Apex registers it as `external`.

GitHub Pages on a project repo silently shadows the apex at the same slug. Decide once; never both.

## Working agreement

- [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): description`) and [Semantic Versioning](https://semver.org/). Keep `CHANGELOG.md` and `package.json` `version` in sync.
- Branch names: `type/scope/short-description`.
- Format with Prettier (`bun run format`) before committing.
- User-facing UI conforms to [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/).
- Long-form usage docs live in [Silmärin](https://github.com/lumikeiju/silmarin), not in project READMEs.

## Rule files

| Concern | File |
| --- | --- |
| Per-path conventions | [`.github/instructions/main.instructions.md`](.github/instructions/main.instructions.md) |
| Accessibility rules | [`.github/instructions/a11y.instructions.md`](.github/instructions/a11y.instructions.md) |
| Accessibility audits | [`.github/agents/accessibility-ally.agent.md`](.github/agents/accessibility-ally.agent.md) |
| Release entries | [`.github/prompts/changelog.prompt.md`](.github/prompts/changelog.prompt.md) |
| Contributor flow | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

The Copilot-specific entry point [`.github/copilot-instructions.md`](.github/copilot-instructions.md) just points back here.

## Editing this template

Keep customization files short and dense. Each fact lives in exactly one file; others link. Prefer bullets over prose. Scope `applyTo` patterns as narrowly as correct.

If you are working in a repo cloned from this template, rewrite `README.md`, `AGENTS.md`, `CHANGELOG.md`, and `package.json` to describe the new project. Don't leave "Peruskivi" language behind.
