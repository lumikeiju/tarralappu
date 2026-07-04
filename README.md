<!-- @format -->

# Tarralappu

_Tarralappu_ (Finnish: sticky note / label) is a sticky-note-themed harness for AI image generation via [OpenRouter](https://openrouter.ai). Bring your own API key, pick a model, write a style guide, attach reference images, and generate variations in a left-to-right chain of refinements.

Live at **[lumikeiju.dev/tarralappu/](https://lumikeiju.dev/tarralappu/)**.

## Features

- **Model-aware**: dynamically fetches every image-capable model from OpenRouter, grouped by creator with inline pricing and an at-a-glance cost tier.
- **Chain-based workflow**: each chain (row) locks to one model. Add a root sketch, refine it to the right, fork any card into a new row to branch.
- **Prompt Board**: a scratchpad of reusable prompt notes; "send" any note to one or more models at once, each landing as an editable draft.
- **Global style context**: a style document, style reference image, and layout reference image attach to any sketch via checkboxes.
- **Conversational refinement**: reasoning models receive the full thread history; image-only models (Flux, etc.) automatically fall back to image-to-image.
- **Cost tracking**: estimated and actual cost per sketch, chain totals, session total, configurable caps.
- **Clear error messages**: typed API errors are mapped to plain language, with a raw-response view for debugging.
- **Client-only, no backend**: your API key stays in the browser and is sent directly to OpenRouter.
- **Dark and light sticky-note themes**, WCAG 2.2 AA compliant.

## Local development

```bash
bun install
bun run dev
```

Then open <http://localhost:5173/tarralappu/>.

## Build

```bash
bun run build   # type-checks then bundles to dist/
bun run preview # serve the production build locally
```

## Deploy

Pushing to `main` triggers the GitHub Actions workflow, which builds with Bun and publishes `dist/` to GitHub Pages at `lumikeiju.dev/tarralappu/`.

## Usage docs

Full usage documentation lives in [Silmärin](https://lumikeiju.dev/silmarin/tarralappu/).

## License

[MIT](LICENSE)

## Conventions

All repository conventions live in [AGENTS.md](AGENTS.md), which both humans and AI coding agents should read first. The `.github/` files implement those conventions for Copilot, Codex, and similar tools.
