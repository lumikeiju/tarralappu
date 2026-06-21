---
description: Project-wide conventions
applyTo: "**"
---

<!-- @format -->

# Project Conventions

Full conventions: [`AGENTS.md`](../../AGENTS.md). Stack-agnostic.

Quick reference:

- **Public surface** — exactly one of `internal` (apex mini-page, no Pages on this repo) or `external` (standalone site at `lumikeiju.dev/<slug>/`). Slug shadowing is silent.
- **Commits** — [Conventional Commits](https://www.conventionalcommits.org/); branches `type/scope/short-description`.
- **Versioning** — [SemVer](https://semver.org/); `CHANGELOG.md` and `package.json` `version` stay in sync.
- **Formatting** — Prettier (`bun run format`) + `.editorconfig`.
- **Accessibility** — [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/); see [`a11y.instructions.md`](a11y.instructions.md).
- **Docs** — long-form usage lives in [Silmärin](https://github.com/lumikeiju/silmarin); link to `https://lumikeiju.dev/silmarin/<slug>/`.

Keep customization files lean. One fact per file; others link.
