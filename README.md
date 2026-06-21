# Peruskivi

_Peruskivi_ (the cornerstone) is the starter template for Lumikeiju's new project repositories. It ships scaffolding — license, formatting, editor config, AI agent customization, CI config, and boilerplate docs — and no tech stack.

## Use this template

1. Create a new repo under `lumikeiju/<project-name>` using GitHub's **Use this template** button.
2. Choose how the project will surface on `lumikeiju.dev`: apex mini-page or standalone site. See [AGENTS.md → Apex vs standalone](AGENTS.md#apex-vs-standalone).
3. Rewrite `README.md`, `AGENTS.md`, `CHANGELOG.md`, and `CONTRIBUTING.md` for the new project. Update `package.json` (`name`, `description`, `version`).
4. Add project source in whatever layout fits the stack.

## Conventions

All repository conventions live in [AGENTS.md](AGENTS.md), which both humans and AI coding agents should read first. The `.github/` files implement those conventions for Copilot, Codex, and similar tools.

## License

MIT. See [LICENSE](LICENSE).
