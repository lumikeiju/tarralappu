<!-- @format -->

# Changelog

[Semantic Versioning](https://semver.org/) · [Conventional Commits](https://www.conventionalcommits.org/).

## v1.8.0 (2026-07-04)

### Features

- Added a page footer (new `Footer.svelte`, a proper `<footer>` landmark) with a short privacy note ("runs entirely in your browser — prompts, images, and your API key stay on this device") and a link to the GitHub repo, plus the current version number. Added a second, icon-only GitHub link in the header for visibility without scrolling.

### Fixes

- The loading screen (shown before the board finishes initializing) had no `<main>` landmark at all, temporarily breaking the skip-link's target and the page's landmark structure. `<main id="main-content">` now always exists; the ready/loading branches render inside it instead of replacing it.

### Polish

- Collapsible "Style & References" / "Prompt Board" section headers now show a hover background, matching the affordance every other interactive control in the app already has.

## v1.7.1 (2026-07-04)

### Fixes

- Corrected the "Stream" checkbox added in v1.7.0, after live-testing against the real API disproved its two premises: (1) the "+$" cost-warning badge implied streaming itself adds cost — live testing (with and without an OpenAI `partial_images` parameter, which OpenRouter's `/chat/completions` silently ignores for this model) showed no cost difference, so the badge was removed; (2) the checkbox's hint promised a live partial-image preview, but OpenAI's GPT image models send the finished image as a single chunk right at the end of generation via this API surface regardless of `stream`/`partial_images` — there's no incremental data to preview. The checkbox's hint now describes its one confirmed real benefit: streamed requests can be cancelled server-side (stopping billing immediately when a generating card is trashed), per [OpenRouter's stream cancellation docs](https://openrouter.ai/docs/api/reference/streaming) (OpenAI is a supported provider); non-streaming requests keep billing to completion even if the client aborts.

## v1.7.0 (2026-07-04)

### Features

- Added a "Stream" checkbox in `ResolutionControls` for models OpenRouter's image model discovery marks `supports_streaming: true` for (currently OpenAI's GPT image models). Checking it sends the generation request with `stream: true` over SSE instead of a single buffered response, and shows a live partial-image preview in place of the usual skeleton while a sketch is generating. The checkbox carries a "+$" badge (with an adjacent text hint, not color-only) warning that streaming may add provider cost for partial frames, per [OpenAI's docs on partial-image streaming cost](https://developers.openai.com/api/docs/guides/image-generation). Note: OpenRouter documents the general chat-completions SSE chunk format for text (`delta.content`) but not the exact shape of image deltas specifically — this best-effort-reads a `delta.images[]` field per chunk for the live preview; if a provider never populates it, streaming still completes correctly, it just won't show partial previews. New `Sketch.streamEnabled` field (additive) carries the choice through generation, refinement, and forking.

## v1.6.2 (2026-07-04)

### Fixes

- OpenAI's GPT image models (`gpt-5-image`, `gpt-5-image-mini`, `gpt-5.4-image-2`) stopped exposing the Aspect/Size controls once model capabilities started coming from OpenRouter's real Image API discovery data. That discovery endpoint describes OpenRouter's separate, stateless _dedicated Image API_ surface, not the `/chat/completions`-based conversational image generation this app actually uses — these three models generate images through an LLM tool call (per [OpenRouter's Unified Image API announcement](https://openrouter.ai/blog/announcements/image-api/): "GPT 5 and 5.4 versions generate images through an LLM, so they don't provide access to the full set of supported parameters") and never supported aspect_ratio/resolution there in the first place. Restored the Aspect/Size controls for exactly these three models (independent of what discovery reports), and added Quality/Background selects (which discovery _does_ confirm for them) so `ResolutionControls` now renders each control independently based on what a model actually supports, rather than assuming every model has all of them. New `Sketch.quality`/`Sketch.background` fields (nullable, additive) carry the choice through generation, refinement, and forking.

## v1.6.1 (2026-07-03)

### Fixes

- Miscellaneous code and documentation updates and cleanups

## v1.6.0 (2026-07-03)

### Features

- Prompt Board notes can now be "sent to" models: a new send button on each note opens a dialog listing every image model (grouped by creator, with pricing and cost-tier badges, filterable, with a Clear-selection button). Confirming creates one new chain per checked model, each pre-filled with the note's text as an editable DRAFT sketch — so aspect ratio, image size, and model choice can still be adjusted per chain before the user explicitly clicks Generate.

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
