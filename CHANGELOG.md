<!-- @format -->

# Changelog

[Semantic Versioning](https://semver.org/) · [Conventional Commits](https://www.conventionalcommits.org/).

## v1.5.0 (2026-07-03)

### Features

- Added a "Prompt Board" shelf (collapsible, like Style & References): a horizontal row of sticky notes with free-text boxes for drafting/copying prompt snippets. Add as many as needed via the dashed "+ Add Note" card; each note has a copy-to-clipboard and remove button. Notes persist in board settings (`BoardSettings.promptNotes`).

## v1.4.0 (2026-07-03)

### Features

- Redesigned the model picker: dropped the pinned/suggested-models shortlist (all image models are shown), grouped models by creator (Google, OpenAI, Black Forest Labs, etc.) with a divider between each group, and added runtime-fetched inline pricing per the [Pricing Object](https://openrouter.ai/docs/guides/overview/models#pricing-object) (per-1M-token, per-image, and per-request rates, whichever apply to the model, with redundant trailing zeros trimmed), plus a small $/$$/$$$ relative-cost badge per model. Genuinely free (`:free`-suffixed) models are labeled "Free" instead of the ambiguous "pricing not listed" shown for models whose cost isn't captured by these fields at all. The "New Sketch" composer card is wider so the full pricing text isn't clipped.

## v1.3.0 (2026-07-03)

### Features

- Improved error handling per [OpenRouter's errors-and-debugging reference](https://openrouter.ai/docs/api/reference/errors-and-debugging): typed `error_type` codes (rate limits, content policy, image errors, context length, etc.) are mapped to plain-language messages, including `Retry-After` hints. In-band provider errors (HTTP 200 with `choices[0].error`, e.g. mid-generation provider failures) are now detected and surfaced instead of a generic "no image returned" message. Error cards get a "View raw response" toggle showing the pretty-printed raw API error body, with copy-to-clipboard.

## v1.2.0 (2026-07-03)

### Features

- Model capabilities (aspect ratios, image sizes, max input reference images) are now resolved from OpenRouter's dedicated Image API discovery endpoint (`GET /api/v1/images/models`) instead of hand-guessed overrides, per [OpenRouter's Unified Image API announcement](https://openrouter.ai/blog/announcements/image-api/). Generation still goes through `/chat/completions`; only capability discovery changed. Falls back to conservative defaults (marked "estimated") if the discovery fetch fails.

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
