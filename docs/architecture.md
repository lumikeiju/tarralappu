<!-- @format -->

# Architecture

Current implementation, not a roadmap. Read [AGENTS.md](../AGENTS.md) for repository conventions and [CONTRIBUTING.md](../CONTRIBUTING.md) for setup, checks, and release operations. Types and request contracts live in source; do not duplicate them here.

## System boundaries

- Client-only Vite + Svelte 5 runes + strict TypeScript; Bun tooling, plain CSS, IndexedDB via `idb`. No SvelteKit, routing, SSR, or backend.
- All generation goes directly from the browser to OpenRouter using the user's key. No direct OpenAI integration or second credential.
- One board UI; deterministic rows of left-to-right refinements, not a draggable canvas. Each row locks its image model.
- Standalone site at `lumikeiju.dev/tarralappu/`; Vite base `/tarralappu/`, build output `dist/`.

## Code map

| Concern | Source of truth |
| --- | --- |
| Startup, shelves, initialization errors | [App.svelte](../src/App.svelte), [main.ts](../src/main.ts) |
| UI, theme tokens | [components/](../src/components/), [app.css](../src/app.css) |
| Board mutations, generation, Random, forks, budgets | [board.svelte.ts](../src/lib/state/board.svelte.ts) |
| App preferences and separate in-memory authentication | [settings.svelte.ts](../src/lib/state/settings.svelte.ts) |
| Domain types, database stores/defaults, CRUD | [schema.ts](../src/lib/db/schema.ts), [repo.ts](../src/lib/db/repo.ts) |
| Blob ownership, descriptions, object URLs | [images.ts](../src/lib/db/images.ts) |
| MIME detection, GIF metadata/posters, SVG validation, raster conversion, markup validation | [media.ts](../src/lib/db/media.ts) |
| Model capabilities, endpoint gates, picker grouping | [capabilities.ts](../src/lib/openrouter/capabilities.ts), [modelGroups.ts](../src/lib/openrouter/modelGroups.ts) |
| Requests and elided source view | [compose.ts](../src/lib/openrouter/compose.ts) |
| Effective options, input ordering, setting inheritance | [options.ts](../src/lib/openrouter/options.ts) |
| HTTP/SSE, discovery, typed errors, API contracts | [client.ts](../src/lib/openrouter/client.ts), [types.ts](../src/lib/openrouter/types.ts) |
| Random text requests and instructions | [randomText.ts](../src/lib/openrouter/randomText.ts), [randomPrompt.ts](../src/lib/openrouter/randomPrompt.ts), [styleGuide.ts](../src/lib/openrouter/styleGuide.ts) |
| Estimates, actual usage, pricing display | [cost.ts](../src/lib/openrouter/cost.ts) |
| Concurrency and abortable jobs | [queue.ts](../src/lib/queue/queue.ts) |

## Domain and persistence

- `Board` owns global style text, style/layout references, prompt notes, pins, and session cap. Prompt Board notes can be sent in batches to the same selected models, creating one draft per prompt/model pair. `Chain` owns row order, locked model, fork provenance, and chain cap. `Sketch` owns parent/order, prompt, attachment flags, generation options, status, results, costs, and request snapshot.
- Creating a root draft requires a model, not a prompt; generating requires a nonempty prompt. Completed generation settings/prompts are immutable; retry uses an errored card, while reroll/refinement forks create editable rows.
- State is hydrated from IndexedDB and mutations write through to it. Strip Svelte reactive proxies before persistence. Database `tarralappu` is version 1; optional additive fields preserve existing records without resets.
- Forks share image IDs: copied chains/sketches and increased image refcounts commit in one transaction. Trash cancels active jobs, cascades through descendants, and releases generated/reference/markup ownership; delete blobs only at refcount zero.
- Reuse `copyGenerationSettings`, `copyRefinementSettings`, and `ownedInputImages` when adding draft/fork paths or owned assets. Completed-output refinements clear obsolete edit sources and markup.
- Store image bytes as Blobs, not base64. Request snapshots contain effective parameters, text, and image IDs, never credentials or embedded bytes. Reconstruct images for sends; source views elide them. Revoke display object URLs when released.
- The key is separate from persisted app settings: memory plus sessionStorage by default, localStorage only with explicit remember opt-in. Never put it in IndexedDB, snapshots, logs, or rendered source.

## Image generation

### Discovery and routing

- Public `GET /api/v1/models?output_modalities=image` supplies the catalog/pricing; `GET /api/v1/images/models` supplies dedicated-image capabilities. Load without a key. Missing discovery produces visibly estimated conservative capabilities.
- Discovered models use `POST /api/v1/images`; legacy models use `POST /api/v1/chat/completions`. Choose from resolved capabilities, not a parallel UI-specific model table.
- GPT Image 2.6 Sunburst/Flare lazily load OpenRouter endpoint descriptors and block generation when endpoint confirmation fails, rather than guessing a chat fallback. Complexity/moderation require allowed passthroughs under `provider.options.openai`, with provider pinning and no option-dropping fallback.
- Custom sizes, markup, GIF frame controls, and preview counts require endpoint-advertised support. Masks and SVG author selection are unavailable. Validate effective values in composition as well as the UI.

### Composition and execution

`SketchCard -> submitSketch -> Queue -> runGeneration -> composeRequest -> OpenRouter -> usage/Blobs/IndexedDB`

- Global style text and style/layout images attach only according to sketch flags. Dedicated requests are stateless: parent outputs or the selected primary edit source come first, ordered subject references next, then global images. Labels must match image order; a selected source is not duplicated.
- Conversational chat refinements resend ancestor prompts and assistant images. Non-conversational fallback sends a single image-to-image turn. Enforce input limits across the entire composed request; truncate old conversation pairs where possible, otherwise block excess explicit inputs.
- Markup is a separate transparent PNG aligned to the base raster, never a flattened reference substitute. Edit inputs must be PNG/JPEG/WebP; GIF/SVG require explicit still extraction/rasterization that leaves originals unchanged.
- Jobs use configurable concurrency (default 2) and abort controllers: `draft/error -> queued -> generating -> done/error`. Trashing is image-generation cancellation. Reload converts interrupted queued/generating cards to retryable errors.
- SSE previews are transient, never persisted as results. Only completed events produce final outputs; preview-only EOF is an error. GIF/multi-output requests use buffered completion; validate incompatible format/stream/compression combinations before dispatch.

## Media, errors, and spending

- Detect MIME from bytes and measure dimensions. Preserve original GIF/SVG/raster bytes for downloads; GIF previews use inert PNG posters until explicit Play. Validate SVG as static content and render only in an isolated image context, never inline markup.
- Persist per-image descriptions for alternative text. Keep accessible names, status/error announcements, keyboard controls, focus restoration, and reduced-motion behavior across cards, markup controls, and lightboxes.
- Handle HTTP and in-band API errors through `OpenRouterApiError`, `humanizeError`, and `rawErrorDetails`. Empty image results and decoding/storage failures remain errors, not successful empty cards.
- Estimates are not hard spending guarantees; unknown is not zero. Use composed input/output counts, reserve known in-flight estimates, and gate session/chain caps against known costs. Unknown-estimate requests may exceed local caps; OpenRouter key limits provide the hard cap. Totals include retained sketches and Random text; deleting a sketch removes its image-generation cost but not Random costs.
- Read actual cost from usage, then generation lookup if needed. Persist returned cost/generation ID even for malformed or in-band error responses and accumulate known charges across retries; flag unreported or interrupted attempts. Abort or lost responses may still incur upstream charges.

## Random text

- Style Guide, Prompt Board notes, and editable sketch prompts share `RANDOM_TEXT_MODEL`: `~deepseek/deepseek-flash-latest`, independent of the row's image model. Requests are text-only, non-streaming, reasoning-disabled (`effort: "none"`; this alias reasons by default and reasoning tokens count against the cap), capped at 512 output tokens, with usage and cancellation. Style Guide generation rotates digital, physical, and hybrid/recursive medium anchors while keeping the resulting art direction brief and open to interpretation.
- Prompt Random cryptographically samples independent visual ingredients, permits style clashes, and avoids adjacent repeats within the page session. Prompt Board Random also returns a concise representative name, used only when the note has no existing name. Refinements preserve subject identity while changing visual treatment. Existing board text/images are never sent; attachment flags stay unchanged.
- Use the shared one-Random-at-a-time guard and session-budget accounting. Flush edits first; replace only validated completed text on a still-valid target. Failure/cancellation preserves text; persistence rollback must retain billed costs. Random never starts image generation.

## Validation and deployment

- Regression tests sit beside OpenRouter modules: [image-generation.test.ts](../src/lib/openrouter/image-generation.test.ts), [randomPrompt.test.ts](../src/lib/openrouter/randomPrompt.test.ts), [styleGuide.test.ts](../src/lib/openrouter/styleGuide.test.ts). Use targeted Bun tests while iterating; required checks are in [CONTRIBUTING.md](../CONTRIBUTING.md#before-committing).
- [CI](../.github/workflows/ci.yml) validates source on `main` and PRs without deployment. [Promotion](../.github/workflows/promote.yml) builds a beta candidate, then verifies and publishes that exact tested artifact without rebuilding.
- `beta`/`stable` contain built files only; never merge source into them. Pages serves `stable` root. Promotion explicitly requests a Pages build because `GITHUB_TOKEN` pushes do not trigger it, and checks the built commit before creating the stable release. Release procedure: [releases](../CONTRIBUTING.md#releases).
