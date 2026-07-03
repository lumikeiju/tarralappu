<!-- @format -->

# Changelog

[Semantic Versioning](https://semver.org/) · [Conventional Commits](https://www.conventionalcommits.org/).

## v1.1.0 (2026-07-03)

### Features

- Add support for optional reasoning effort on the `openai/gpt-5.4-image-2` model. Resolution controls expose a Reasoning selector; sketch updates persist the value, and sketch creation/refinement/forking carry it forward.

## v1.0.0 (2026-06-21)

### Features

- Initial release!
- Sticky-note board with dark/light themes (WCAG 2.2 AA)
- Dynamic model picker: fetches all image-capable models from OpenRouter; pins common defaults, expandable full list with filter
- Chain-locked model: each row locks to one model; per-card model deferred
- Global style document, style reference image, and layout reference image with per-sketch attachment checkboxes
- Conversational refinement for reasoning models; image-to-image fallback for image-only models with warning
- View source (`</>`) per card: elides image base64, redacts API key, copy-to-clipboard
- Cascade trash with pending-trash preview and confirm; fork (Refresh) to a new row with shared ancestor images
- Model-aware resolution controls (aspect ratio + image size)
- Cost tracking: estimated + actual per sketch, chain totals, session total, configurable caps (session + per-chain)
- Concurrency-capped queue with AbortController cancellation on trash
- IndexedDB persistence: images stored as Blobs, refcounted across forks
- API key in sessionStorage (default) or localStorage (opt-in with danger warning)
