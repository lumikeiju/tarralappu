<!-- @format -->

# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [Semantic Versioning](https://semver.org/) · [Conventional Commits](https://www.conventionalcommits.org/).

## v2.0.0 (2026-11-07)

### Added

- Added endpoint-aware complexity and moderation controls for GPT Image 2.6 Sunburst and Flare through OpenRouter; gated unconfirmed features.
- Added persistent per-sketch references, keyboard-accessible ordering, primary edit-source selection, and explicit GIF frame extraction and SVG rasterization.
- Added original-media downloads, image dimensions and format details, and opt-in GIF playback on cards and in the lightbox.
- Added endpoint-gated transparent PNG markup uploads and a keyboard-accessible annotation editor. Gated custom sizes, GIF controls, and preview counts; left unsupported masks and SVG authoring unavailable.
- Added editable, persistent image descriptions for media alternative text.
- Added global-reference upload announcements and focused the replacement control after upload.
- Minimized the session-cap card and moved detailed budget guidance into a disclosure.
- Added regression tests for endpoint capabilities, requests, reference limits, option inheritance, media identity, and streaming.
- Added a GitHub source link to the API-key privacy hint.
- Linked the footer's “open-source” text to the GitHub repository.
- Pinned GPT Image 2.6 Sunburst and Flare on new boards and existing boards once, while preserving later pin changes.
- Added cancellable, budget-aware Random actions for the Style Guide, Prompt Board notes, and sketch prompts. Preserved note names and pending edits on failure or cancellation.
- Allowed blank sketch drafts after model selection; kept nonempty prompts required for image generation.
- Added refinement-specific random prompt ideas, persistence, pending-edit protection, and shared request and budget safeguards.

### Changed

- Moved source validation to `main` and pull requests without deployment.
- Replaced automatic deployment with manual `main` → `beta` → `stable` promotion; published tested artifacts without rebuilding and attached ZIPs, checksums, manifests, and provenance.
- Required `stable` / (root) Pages configuration and explicit approval; verified candidates and builds and rejected unsupported versions and existing tags.
- Switched to TypeScript 6 and standard `svelte-check`; removed preview dependencies and flags and retained Dependabot's TypeScript major-version block.
- Routed all Random actions through OpenRouter's `~deepseek/deepseek-flash-latest` alias.
- Clarified that local totals excluded deleted sketches and did not enforce provider spending limits.
- Diversified random prompts with independently sampled subjects, settings, media, palettes, framing, lighting, and disruptions; avoided adjacent repeats and encouraged dramatic refinement changes.
- Replaced the implementation plan with a concise [architecture guide](docs/architecture.md) covering modules, workflows, persistence, capability gates, costs, and deployment.
- Condensed [AGENTS.md](AGENTS.md) to current conventions and documentation links.
- Streamlined [CONTRIBUTING.md](CONTRIBUTING.md) to recurring development and release workflows.
- Reworked [README.md](README.md) around the app workflow, privacy and costs, setup, documentation, and releases.
- Standardized short Bun aliases in documentation and workflows; retained `bun run build` to invoke the project build.

### Fixed

- Disabled reasoning for Random requests after default reasoning tokens exhausted the output limit.
- Preserved reported generation and Random costs across malformed responses, provider errors, and retries; flagged potentially unreported charges and displayed small costs accurately.
- Made reference ownership and refinement creation atomic; rolled back failed reference changes and corrected model selection and request snapshots.
- Kept partial SSE previews separate from final results and rejected incomplete or malformed image streams.
- Blocked incompatible GIF, Sunburst SVG, compression, and multi-output streaming options.
- Clarified uncertain cost estimates and local budget limits; required acknowledgment for capped requests without reliable estimates and reserved known in-flight costs.
- Preserved reported costs and generation IDs when response storage or decoding failed; surfaced media-format mismatches.
- Persisted forks and image references atomically; cleared obsolete edit sources and markup during refinement.
- Preserved declared SVG dimensions during raster conversion.
- Closed the image viewer on Escape and restored focus to its opener.
- Replaced artist-specific Style Guide placeholder text with neutral color and lighting guidance.

### Removed

- Removed duplicate and obsolete customization instructions, the unnecessary Python activation requirement, and the redundant header GitHub icon.

## v1.12.3 (2026-10-31)

### Fixed

- Switched Dependabot to the Bun ecosystem and blocked incompatible TypeScript major upgrades.
- Corrected image request reasoning fields, validated model options, based estimates on composed image counts, and cleaned up staged images after interruption.
- Recovered queued or generating sketches as interrupted errors after reload; added an initialization retry action.
- Improved keyboard focus, control names and states, color contrast, scroll access, and external-link indicators.
- Restored missing and misordered changelog entries.

## v1.12.2 (2026-09-13)

### Fixed

- Fixed attachment hint IDs, lightbox focus contrast, model-picker error feedback, and narrow-screen pricing overflow.

## v1.12.1 (2026-09-13)

### Fixed

- Aligned compact setup controls by normalizing line and input heights.

## v1.12.0 (2026-09-13)

### Added

- Added persistent model pinning, with pinned models shown first and retained in their creator groups.

## v1.11.0 (2026-09-13)

### Added

- Added 1–10 initial-run forks for root drafts, with independent editable chains that inherit model and generation settings.

## v1.10.1 (2026-07-18)

### Fixed

- Prevented long error URLs, raw API responses, and other card text from overflowing sketch cards.

## v1.10.0 (2026-07-18)

### Added

- Added OpenRouter's dedicated Image API for discovered models while retaining chat completions for legacy models.
- Added model-aware output count, format, compression, seed, and reference-image limits.
- Added Image API streaming, non-PNG formats, and multi-output display.
- Updated request snapshots, pricing labels, documentation, and release metadata for the Image API.

## v1.9.2 (2026-07-18)

### Fixed

- Switched the build check to TypeScript 7's native preview through the supported `svelte-check` integration, retaining TypeScript 6 for the language-tools bridge.

## v1.9.1 (2026-07-18)

### Fixed

- Upgraded Svelte, Vite, and TypeScript together to support TypeScript 6 in `svelte-check`.

## v1.9.0 (2026-07-10)

### Added

- Added editable names to Prompt Board notes.
- Added separate rerun and refinement forks for completed sketches, with 1–4 branches per action and editable inherited drafts.
- Preserved prompts, attachments, and generation settings in rerun and refinement forks, including forks from unfinished refinements.
- Increased the default Prompt Board card size.

## v1.8.0 (2026-07-04)

### Added

- Added hover backgrounds to collapsible section headers.
- Added a footer with a privacy note, repository link, and app version; added a header GitHub link.

### Fixed

- Kept the main landmark present during loading so the skip link always had a target.

## v1.7.1 (2026-07-04)

### Fixed

- Removed the unsupported streaming cost warning and corrected the preview hint after testing showed that image previews arrived only at completion. Clarified that cancelling a request may not prevent billing.

## v1.7.0 (2026-07-04)

### Added

- Added opt-in streaming for models advertising support, including best-effort partial previews; persisted the setting across generation, refinement, and forks.

## v1.6.2 (2026-07-04)

### Fixed

- Restored aspect-ratio and size controls for GPT image models using chat completions; added their supported quality and background controls based on OpenRouter discovery.

## v1.6.1 (2026-07-03)

### Changed

- Updated code and documentation.

## v1.6.0 (2026-07-03)

### Added

- Added a dialog for sending Prompt Board notes to selected image models as editable draft chains.

## v1.5.0 (2026-07-03)

### Added

- Added a persistent Prompt Board for drafting, copying, naming, and deleting prompt notes.

## v1.4.0 (2026-07-03)

### Added

- Replaced the model shortlist with all image models grouped by creator; added live pricing, relative-cost labels, and room for full pricing details.

## v1.3.0 (2026-07-03)

### Added

- Added typed OpenRouter error messages, including retry hints, and surfaced in-band provider errors.
- Added a copyable raw-response view to error cards.

## v1.2.0 (2026-07-03)

### Added

- Loaded model capabilities from OpenRouter's Image API discovery endpoint and used conservative estimated defaults when discovery failed.

## v1.1.0 (2026-07-03)

### Added

- Added optional reasoning-effort controls for `openai/gpt-5.4-image-2` and preserved the setting across sketch creation, refinement, and forks.

## v1.0.0 (2026-06-21)

### Added

- Released the sticky-note image-generation board with dark and light themes.
- Added a dynamic OpenRouter image-model picker with common defaults, pinning, and filtering.
- Locked each sketch chain to one model.
- Added global style guidance and style/layout reference images with per-sketch attachment controls.
- Added conversational refinements and image-to-image fallback for models without conversational support.
- Added a source view that redacted API keys and omitted image data.
- Added cascade deletion, editable forks, and shared ancestor images.
- Added model-aware aspect-ratio and image-size controls.
- Added estimated and actual cost tracking with session and chain limits.
- Added a concurrency-limited generation queue with cancellation on deletion.
- Persisted boards and refcounted image blobs in IndexedDB.
- Stored API keys in session storage by default, with opt-in local storage.
