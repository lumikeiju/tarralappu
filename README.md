<!-- @format -->

# Tarralappu

<p align="center">
  <strong>A sticky-note workspace for exploring AI image generation.</strong><br />
  Build prompts, compare models, and grow images through branching refinements — right in your browser.
</p>

<p align="center">
  <a href="https://github.com/lumikeiju/tarralappu/actions/workflows/ci.yml"><img src="https://github.com/lumikeiju/tarralappu/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
  <a href="https://www.w3.org/TR/WCAG22/"><img src="https://img.shields.io/badge/accessibility-WCAG%202.2%20AA%20target-2ea44f" alt="Accessibility target: WCAG 2.2 Level AA" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.3.14-black?logo=bun" alt="Built with Bun 1.3.14" /></a>
</p>

<p align="center">
  <a href="https://lumikeiju.dev/tarralappu/"><strong>Open Tarralappu</strong></a>
  &nbsp;·&nbsp;
  <a href="https://lumikeiju.dev/silmarin/tarralappu/">Usage guide</a>
  &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

Tarralappu is a browser-based workspace for image generation through [OpenRouter](https://openrouter.ai) with a sticky note theme. Bring an API key, choose an image model, and explore ideas in a persistent board of prompts, references, and image variations.

## What you can do

- **Explore models.** Browse OpenRouter's image model catalog, grouped by creator with live pricing and model-specific controls.
- **Develop variations.** Generate sketches in model-locked rows, refine them step by step, or fork a card to explore another direction.
- **Build visual context.** Reuse style guides, reference images, and Prompt Board notes. Random actions generate new style guidance or image prompts.
- **Guide image edits.** Add ordered subject references, choose an edit source, and annotate images when the selected endpoint supports markup.
- **Work with media.** View and download original files, inspect dimensions, play GIFs on demand, and explicitly extract GIF frames or rasterize SVGs before editing.
- **Track usage.** Review estimated and reported costs, set local session and chain caps, and see when costs may be incomplete.

## How it works

1. Open the app and provide an OpenRouter API key.
2. Choose an image model and draft a prompt, optionally adding shared style context or per-sketch references.
3. Generate an image, refine it in the same row, or fork it into a separate chain.
4. Adjust only the options supported by the selected model and endpoint.

## Privacy and costs

- Generation requests go from your browser directly to OpenRouter; Tarralappu has no application backend.
- Your key stays in memory and session storage by default. Choosing **Remember key** stores it in local storage.
- Boards, prompts, and image data are saved in your browser's IndexedDB.
- Random text generation uses DeepSeek Flash through OpenRouter and incurs API charges.
- Local cost estimates and caps are not provider billing limits. Set a spending limit in OpenRouter for a hard cap; some costs may be unknown or reported after a request.

## Get started

Use the [live app](https://lumikeiju.dev/tarralappu/) or run it locally. Local development requires [Bun](https://bun.sh/) 1.3.14 and a modern browser.

```sh
bun install
bun dev
```

Open <http://localhost:5173/tarralappu/> and enter your OpenRouter key in the app.

To check or preview a production build:

```sh
bun test
bun run build
bun preview
```

## Documentation

| Document | What it covers |
| --- | --- |
| [Usage guide](https://lumikeiju.dev/silmarin/tarralappu/) | Using Tarralappu's image workflows |
| [Architecture](docs/architecture.md) | Code boundaries, persistence, workflows, and deployment |
| [Contributing](CONTRIBUTING.md) | Local setup, checks, and release process |
| [Changelog](CHANGELOG.md) | Notable changes by release |

## Release and deployment

`main` contains source and runs CI without deploying. The manual **Promote site** workflow builds a beta candidate, then publishes that tested artifact to `stable` without rebuilding. The `beta` and `stable` branches contain built site files only; GitHub Pages serves the `stable` branch root. See the [release process](CONTRIBUTING.md#releases).

## License

[MIT](LICENSE)

---

<p align="center">
  <img src="src/assets/ai-label.png" alt="AI-assisted project" title="AI-assisted project" width="32" height="32" />
</p>
