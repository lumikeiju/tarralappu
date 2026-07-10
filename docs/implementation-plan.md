<!-- @format -->

# Tarralappu — Architecture Reference

How the app is built, for anyone (human or agent) making changes. This describes the **current** implementation, not a forward-looking plan — see [`CHANGELOG.md`](../CHANGELOG.md) for the history of how it got here and [`AGENTS.md`](../AGENTS.md) for repo-wide conventions.

---

## 1. What this is

**Tarralappu** (Finnish: "sticky note / label") is a single-page, client-only web app that acts as a **harness for AI image generation** through [OpenRouter](https://openrouter.ai). The user brings their own OpenRouter API key, picks an image-capable model per chain, writes a global **style document**, optionally attaches a **style reference image** and a **layout reference image**, then spawns any number of **sketches** (generation attempts). Each sketch can be **refined** in a left-to-right **chain** (row). A **Prompt Board** shelf holds reusable prompt scratch-notes that can be "sent to" one or more models at once, each landing as a new draft chain. The aesthetic is a **sticky-note board** with **dark and light themes**.

It is a personal-but-public tool. Optimise for the single maintainer's clarity over ecosystem generality.

### Hard constraints (do not violate)

- **No backend.** Static site only. The user's API key lives in the browser and is sent **directly** to OpenRouter. Nothing transits a server we control.
- **Standalone GitHub Pages** at `lumikeiju.dev/tarralappu/`. Base path is `/tarralappu/`.
- **No draggable/free canvas — ever.** Layout is a strict, deterministic grid of rows.
- **WCAG 2.2 AA** for all UI (`.github/instructions/a11y.instructions.md`).
- **Conventional Commits + SemVer.** Keep `CHANGELOG.md` and `package.json` `version` in sync.
- Format with Prettier (`bun run format`) before committing.

---

## 2. Stack & dependencies

- **Runtime/build:** Bun (package manager + script runner) + Vite.
- **Framework:** Svelte 5 with **runes** (`$state`, `$derived`, `$effect`). No SvelteKit (single page, no routing/SSR).
- **Language:** TypeScript, `strict: true`.
- **Persistence:** [`idb`](https://www.npmjs.com/package/idb) wrapper over IndexedDB.
- **Styling:** Plain CSS with custom properties. **No** CSS framework, **no** state-management lib (runes suffice), **no** form lib, **no** drag lib.

### Dependencies

```
dependencies:    svelte, idb
devDependencies: vite, @sveltejs/vite-plugin-svelte, typescript, svelte-check,
                 @tsconfig/svelte, prettier, prettier-plugin-svelte
```

### Scripts (`package.json`)

```jsonc
{
    "scripts": {
        "dev": "vite",
        "build": "svelte-check --tsconfig ./tsconfig.json && vite build",
        "preview": "vite preview",
        "check": "svelte-check --tsconfig ./tsconfig.json",
        "format": "prettier --write .",
        "format:check": "prettier --check ."
    }
}
```

### Vite config essentials

- `base: '/tarralappu/'`.
- `plugins: [svelte()]`.
- Build output `dist/`.

---

## 3. Repository layout

```
index.html
vite.config.ts
svelte.config.js
tsconfig.json
package.json
.github/workflows/deploy.yml     (GH Pages)
docs/implementation-plan.md      (this file)
src/
  main.ts
  App.svelte                      (top-level shelves: Style & References, Prompt Board, Board)
  app.css                         (global tokens + theme + reset)
  lib/
    openrouter/
      types.ts                    (request/response/model/error TS types)
      client.ts                   (fetch wrappers: chatCompletion, listImageModels,
                                    listImageModelCapabilities, error handling)
      capabilities.ts              (resolves ModelCapabilities from live discovery data)
      modelGroups.ts               (creator grouping shared by ModelPicker + SendToDialog)
      compose.ts                   (message composition: conversational + i2i, ref labeling)
      cost.ts                      (pre-send estimate, usage parsing, pricing/tier formatting)
    queue/
      queue.ts                     (concurrency-limited job runner)
    state/
      settings.svelte.ts           (key, theme, caps, concurrency)
      board.svelte.ts              (board/chains/sketches/prompt-notes reactive store)
    db/
      schema.ts                    (idb open + object stores + domain types)
      repo.ts                      (CRUD: boards/chains/sketches/settings)
      images.ts                    (Blob storage, refcounting, objectURL lifecycle)
    util/
      id.ts                        (crypto.randomUUID wrapper)
  components/
    SetupBar.svelte                (key entry + theme toggle + cost meter + concurrency)
    ApiKeyPanel.svelte
    NewChainComposer.svelte        (model picker + first prompt; creates a chain-locked row)
    ModelPicker.svelte             (grouped-by-creator, priced, filterable)
    SendToDialog.svelte            (Prompt Board "send to models" multi-select dialog)
    PromptBoard.svelte             (scratch-note shelf: add/edit/copy/remove/send)
    StyleDocPanel.svelte
    ReferenceImages.svelte
    SessionCapPanel.svelte
    NotePanel.svelte                (reusable sticky-note card wrapper)
    Board.svelte
    Chain.svelte                    (one row; shows locked-model badge + chain cost cap)
    SketchCard.svelte
    AttachmentChecks.svelte
    ResolutionControls.svelte
    CardActions.svelte              (view-source, trash-cascade, refresh/fork, retry)
    Lightbox.svelte                 (native <dialog> image zoom)
    CostMeter.svelte
    ThemeToggle.svelte
    Admonition.svelte               (warning / danger callouts)
```

---

## 4. Domain model (TypeScript)

Kept in `lib/db/schema.ts`. This mirrors the actual types — see that file for the source of truth.

```ts
type ID = string; // crypto.randomUUID()

interface PromptNote {
    id: ID;
    name: string;
    text: string; // free-text scratchpad note, not attached to generation
}

interface BoardSettings {
    defaultModelId: string | null;
    styleDoc: string;
    styleRefImageId: ID | null;
    layoutRefImageId: ID | null;
    sessionCostCapUsd: number | null;
    defaultAspectRatio: string;
    defaultImageSize: string;
    promptNotes: PromptNote[];
}

interface Board {
    id: ID;
    name: string;
    createdAt: number;
    settings: BoardSettings;
}

interface Chain {
    id: ID;
    boardId: ID;
    order: number; // row order, top to bottom
    modelId: string; // CHAIN-LOCKED model; every sketch in this row uses it (per-card model deferred)
    forkedFrom: {
        chainId: ID;
        sketchId: ID;
        sketchOrder: number;
        kind: "reroll" | "refinement";
    } | null; // provenance when created via fork
    chainCostCapUsd: number | null;
    createdAt: number;
}

type SketchStatus = "draft" | "queued" | "generating" | "done" | "error";

interface AttachFlags {
    styleDoc: boolean;
    styleRef: boolean;
    layoutRef: boolean;
}

interface Sketch {
    id: ID;
    chainId: ID;
    parentSketchId: ID | null; // null = root (leftmost in row)
    order: number; // position within the chain, left to right
    modelId: string; // mirrors chain.modelId (denormalised; chain-locked)
    prompt: string;
    attach: AttachFlags;
    aspectRatio: string;
    imageSize: string;
    reasoningEffort: "low" | "medium" | "high" | null; // openai/gpt-5.4-image-2 only
    status: SketchStatus;
    error: string | null; // human-readable message
    errorRaw: string | null; // pretty-printed raw API error body, or null for local/synthetic errors
    costEstimateUsd: number | null;
    costActualUsd: number | null;
    resultImageIds: ID[]; // generated image(s); display first as primary
    requestSnapshot: SketchRequestSnapshot | null; // lightweight: params + prompt + image IDs, never base64
    createdAt: number;
}

interface StoredImage {
    id: ID;
    role: "generated" | "styleRef" | "layoutRef";
    blob: Blob; // store as Blob, not data URL
    mime: string;
    refCount: number; // # of sketches referencing it; forks share image IDs, delete only at 0
    createdAt: number;
}

// Lightweight, base64-free record of what was sent (powers View source + retry).
interface SketchRequestSnapshot {
    model: string;
    modalities: ("image" | "text")[];
    image_config?: { aspect_ratio?: string; image_size?: string };
    provider?: { reasoning_effort?: "low" | "medium" | "high" };
    messages: Array<{
        role: "user" | "assistant";
        text: string;
        imageRefs: ID[]; // StoredImage IDs in order (base64 reconstructed on demand, never persisted here)
    }>;
}
```

---

## 5. OpenRouter integration

### 5.1 Endpoints

- **Chat completion (generation):** `POST https://openrouter.ai/api/v1/chat/completions`
- **Model catalog + pricing:** `GET https://openrouter.ai/api/v1/models?output_modalities=image`
- **Model capability discovery:** `GET https://openrouter.ai/api/v1/images/models` (from OpenRouter's dedicated [Image API](https://openrouter.ai/blog/announcements/image-api/); public, no key)

Headers on every call:

```
Authorization: Bearer <key>
Content-Type: application/json
HTTP-Referer: https://lumikeiju.dev/tarralappu/   (optional ranking metadata)
X-Title: Tarralappu                                (optional ranking metadata)
```

> **Both `GET` endpoints above are public** — no API key needed. Fetch them on first load so the picker is populated before the user enters a key. The key is required only for **generation**.

**Why generation still goes through `/chat/completions` and not the dedicated `/api/v1/images` endpoint:** that endpoint is stateless (single prompt + optional reference images, no conversation), which would break the conversational-refinement design (§6.4 below). It's used here only for capability discovery, not generation.

### 5.2 Request body (generation)

```jsonc
{
    "model": "<modelId>",
    "messages": [/* see §6 composition */],
    "modalities": ["image", "text"], // or ["image"] for image-only models
    "image_config": { "aspect_ratio": "16:9", "image_size": "2K" }, // omitted if unsupported
    "usage": { "include": true }, // request usage accounting for cost
    "stream": false
}
```

- **`modalities` is model-dependent.** Text+image models use `["image","text"]`; image-only models (Flux, Sourceful, Recraft, GPT Image) use `["image"]`. Derived from `ModelCapabilities.outputModalities`.
- `image_config` is included only when `ModelCapabilities.supportsImageConfig` is true, with values constrained to that model's allowed aspect ratios/sizes.

### 5.3 Response shape

```jsonc
{
    "choices": [
        {
            "message": {
                "role": "assistant",
                "content": "optional text",
                "images": [
                    {
                        "type": "image_url",
                        "image_url": { "url": "data:image/png;base64,..." }
                    }
                ]
            },
            "error": {
                "code": 502,
                "message": "...",
                "metadata": { "error_type": "..." }
            } // optional, in-band failure — see §8
        }
    ],
    "usage": {/* tokens + cost when usage.include=true */}
}
```

- Generated image = `choices[0].message.images[].image_url.url` (base64 data URL → convert to Blob, store).
- **Guard:** if `images` is missing/empty and there's no in-band `error`, treat as error state "no image returned".

### 5.4 Capability model

`capabilities.ts` resolves a `ModelCapabilities` object per model by merging two sources:

1. The pricing/catalog list (`GET /models?output_modalities=image`) — id, name, `architecture.output_modalities`, `pricing`.
2. The capability discovery list (`GET /images/models`) — real, provider-verified `supported_parameters` (`aspect_ratio` enum, `resolution` enum, `input_references` range).

```ts
interface ModelCapabilities {
    id: string;
    name: string;
    outputModalities: ("image" | "text")[]; // from architecture.output_modalities
    conversational: boolean; // = outputModalities.includes("text")
    maxInputImages: number; // from discovery's input_references range max
    aspectRatios: string[]; // from discovery's aspect_ratio enum
    imageSizes: string[]; // from discovery's resolution enum
    supportsImageConfig: boolean; // true if either list above is non-empty
    estimated: boolean; // true only when discovery data is unavailable for this model
    pricing: ModelPricing;
}
```

No hand-curated override table — when discovery data is missing for a model (fetch failure, or a model discovery hasn't indexed yet), `capabilities.ts` falls back to a small conservative default and marks the result `estimated: true`, surfaced in the UI as a "capabilities estimated" note.

### 5.5 Cost

- **Pre-send estimate** (`estimateCost`): computed from the model's flat `pricing.image`/`pricing.request` fields when populated. Returns `null` for token-billed models or models whose cost isn't captured by these fields — `costActualUsd` is always the source of truth.
- **Prompt caching:** a resent conversational thread typically hits the provider's prompt cache at a discount, so real cost is usually **below** the naive full-thread estimate. Estimates are shown with an explicit "may be inexact" caveat.
- **Actual cost:** read from `usage.cost`/`usage.total_cost` in the response (`parseCostFromResponse`). If absent, fall back to `GET /api/v1/generation?id=<id>` (`fetchGenerationCost`). Persisted as `Sketch.costActualUsd`.
- **Inline pricing display** (`formatModelPricing`, `pricingTier` in `cost.ts`): per the [Pricing Object](https://openrouter.ai/docs/guides/overview/models#pricing-object) fields, shown per-million-tokens / per-image / per-request, whichever apply; a `:free`-suffixed model id shows "Free" instead of the ambiguous zero. `pricingTier` buckets the dominant pricing dimension into a `$`/`$$`/`$$$` badge — a relative hint, not an exact cross-model comparison.
- **Caps:** see §9.

---

## 6. Request composition (`compose.ts`)

Pure functions that turn board state + a sketch into an OpenRouter request body. Two modes.

### 6.1 Attachment assembly

Global assets attach per the sketch's `AttachFlags`:

- **Style document** (`attach.styleDoc`): prepended into the user text.
- **Style reference image** (`attach.styleRef`): added as an `image_url` part.
- **Layout reference image** (`attach.layoutRef`): added as an `image_url` part.

**Reference labeling (conversational models):** because the API gives images no semantic role, prepend explicit labels in the text, ordered to match image order. Only label what's attached:

```
[STYLE GUIDE]
<styleDoc>

The first attached image is a STYLE REFERENCE — match its palette, texture, lighting, and mood; do not copy its subject.
The second attached image is a LAYOUT REFERENCE — match its composition and element placement; ignore its colours and content.

[REQUEST]
<sketch prompt>
```

Images array order matches the label order (style ref first, layout ref second). A label line is omitted when its image isn't attached.

### 6.2 Input-image count enforcement

The cap applies to the **whole outgoing request** (all `image_url` parts across all messages), not just the current turn:

1. Trust the model's `maxInputImages` and enforce only per-request.
2. If a composed request would still exceed it, truncate conversation history to the most recent assistant image before counting again.
3. If the user's explicitly attached refs (styleRef + layoutRef + parent image on i2i) still exceed the cap after truncation, block the send and tell the user to uncheck attachments.

### 6.3 Root sketch

`messages` = single `user` message with content parts `[text, ...attachedImages]`. `modalities` per capability.

### 6.4 Refinement — conversational models

Walk the chain from root to the current sketch's parent and rebuild the full thread, resending prior assistant images so the model can edit them:

```
[
  user(turn1 text + attached refs/images),
  assistant(images: [parentResultImage]),
  user(turn2 refinement text + optionally re-attached refs),
  assistant(...),
  ...
  user(current refinement text)
]
```

**Re-attaching style/layout refs on a refinement defaults OFF** — refs from earlier turns already persist in the resent history.

### 6.5 Refinement — image-only fallback

For non-conversational models, a refinement is a single-step image-to-image: one `user` message containing the refinement text + the **parent sketch's generated image** as an `image_url` part (+ any checked refs, subject to the input-image cap). `modalities: ["image"]`. The UI shows a warning (`Admonition`) when a non-conversational model is selected, explaining refinements lose conversation context.

### 6.6 View source (raw request) — per card

Every sketch card exposes a **"View source"** control (`</>`) that reveals the **exact request body** for that card, produced by the **same `compose.ts` functions** the queue uses.

- Image parts are elided, never raw base64: `{ type: "image_url", image_url: { url: "data:image/png;base64,…<imageId=…>" } }`.
- The `Authorization` header / API key is never shown.
- Copy-to-clipboard action; rendered as text only (never `innerHTML`).
- `SketchRequestSnapshot` persists only `model`, `modalities`, `image_config`, composed text, and **image IDs** — never base64.

---

## 7. State architecture (Svelte 5 runes)

- **`settings.svelte.ts`** — reactive singleton: `apiKey` (in memory; mirrored to sessionStorage, or localStorage if "remember" opted in), `rememberKey`, `theme`, `concurrency`, session cost cap. Hydrated from storage on load.
- **`board.svelte.ts`** — reactive board graph: the board, its chains (rows), sketches, and prompt notes. Exposes derived selectors (`getChainsOrdered`, `sketchesForChain`, `getSessionCostTotal`, `chainCostTotal`) and mutations (`createChain`, `createRootSketch`, `createRefinementSketch`, `updateSketch`, `submitSketch`, `trashSketchesFrom`, `forkReroll`, `forkRefinementDrafts`, `addPromptNote`/`updatePromptNote`/`removePromptNote`, `sendPromptToModels`).
- Capability data: `boardState.availableModels: ModelCapabilities[]` plus `capabilitiesFor(modelId)` — each **chain** resolves capabilities from its locked `modelId`.

Persistence is **write-through**: every mutation updates runes state and the matching IndexedDB record (`Object.assign` + `saveX(JSON.parse(JSON.stringify(x)))` to strip Svelte 5 reactive proxies before serialization). On load, hydrate runes from IndexedDB. Image blobs are exposed as object URLs created on mount, revoked on unmount — never held as data URLs in reactive state.

---

## 8. Errors

Per [OpenRouter's errors-and-debugging reference](https://openrouter.ai/docs/api/reference/errors-and-debugging), `client.ts`'s `OpenRouterApiError` covers both:

- **Request-level failures** (non-2xx HTTP status) — parsed from the `{ error: { code, message, metadata } }` body, with `Retry-After` respected.
- **In-band failures** (HTTP 200, but `choices[0].error` is present) — generation failed mid-flight even though the request itself was valid.

`humanizeError()` maps the typed `error_type` (rate limits, content policy, image errors, context length, etc.) to a plain-language message; `rawErrorDetails()` returns the pretty-printed raw body for the "View raw response" toggle on error cards. Local/synthetic errors (no API key set, cost cap exceeded, too many reference images) have no raw body (`errorRaw: null`).

---

## 9. Queue, concurrency, cost caps (`queue/queue.ts`)

- A promise-based queue with a **configurable concurrency cap** (default **2**, user-adjustable in settings).
- A job = `{ id, run }`. Lifecycle drives `Sketch.status`: `queued → generating → done | error`.
- **Retry** re-enqueues the same sketch (status back to `queued`), reusing/rebuilding the request.
- **Cost gating before dispatch:** compute `costEstimateUsd`; if it would push the session or chain cost cap over the limit, block with an `error` status (not auto-retried). Always show the "estimates may be inexact" caveat near caps.
- After success, record `costActualUsd`; totals recompute via derived selectors.
- **Cancellation.** Every job holds an `AbortController`. **Trashing a `queued` or `generating` card cancels its job** — the fetch aborts, no cost is recorded, and the sketch is removed. There's no standalone "cancel" button; trashing is the only cancel path.
- **No streaming** — single request/response.

---

## 10. Layout & UI

### Structure

- **SetupBar** (top, sticky): API key panel, theme toggle, CostMeter (session total vs cap), concurrency setting. No model picker here — model is chain-locked, chosen per chain.
- **Style & References shelf** (collapsible): StyleDocPanel + ReferenceImages + SessionCapPanel, each in a tinted `NotePanel`.
- **Prompt Board shelf** (collapsible, collapsed by default): a horizontally-scrolling row of scratch-note cards (`PromptBoard.svelte`), each with a free-text box, copy-to-clipboard, remove, and "send to models" (opens `SendToDialog.svelte` — grouped/priced/filterable checkbox list; confirming spawns one new draft chain per checked model).
- **Board:** vertical stack of **Chains**. Each **Chain is a ROW**: root sketch on the left, refinements extending right; **"+ New Sketch"** adds a new root (new row) via `NewChainComposer` (contains `ModelPicker` — grouped by creator, priced, filterable). The chosen model is locked for that row. A refine control sits at the row's right end once the rightmost card is `done`. Per-row cost cap input + chain cost total.

### Sketch card contents

- Prompt textarea (draft/error cards only — immutable once `done`).
- **AttachmentChecks**: attach style description / style ref / layout ref, each disabled if the asset is absent; checking beyond `maxInputImages` is blocked.
- **ResolutionControls**: aspect-ratio + size selectors, populated only with the model's allowed values.
- **View source** (`</>`), **Trash** (cascade), **Re-run prompt**, **Fork refinements**, and **Retry** (error cards).
- Generate/Refine button, status, result image (with zoom via `Lightbox`), estimated/actual cost.

### Card actions: trash, re-run, and refinement forks

Completed sketches are **immutable**.

- **Trash (cascade).** Removes the card **and all descendants to its right** in the row. A "pending-trash" style previews the blast radius before an explicit confirm click. Cancels any in-flight job first; decrements image refcounts.
- **Re-run prompt.** A completed card's refresh icon can fork the chain **up to that card** into one to four **new rows**: completed ancestors are copied reusing the originals' images (refcount++), and the selected position becomes an editable draft pre-filled with that card's prompt and settings (attachments, resolution, quality/background, streaming, and reasoning). The new chains record a `reroll` `forkedFrom` provenance value and inherit the source chain's model.
- **Fork refinements.** A completed card's branch icon can create one to four sibling rows. Each row copies the completed path through that image, then ends in an editable refinement draft carrying the selected card's prompt and settings. A draft or errored refinement can use the same control to create sibling branches from its completed parent; those branches preserve the in-progress prompt and all settings, allowing several variations to be prepared before any is generated. The shared numeric selector and multiplication sign apply to both fork actions.

**Retry** (error cards) re-enqueues the same request on the same card. **Re-run prompt** creates a draft with the selected completed prompt; **Fork refinements** creates editable refinement drafts with the selected prompt and settings — all are distinct controls.

---

## 11. Theme system

- CSS custom properties in `app.css`; `:root[data-theme="light"]` and `:root[data-theme="dark"]` token sets, plus a `prefers-color-scheme` media-query default.
- Manual `ThemeToggle` override persists in `localStorage`.
- Both themes meet WCAG 2.2 AA contrast (≥ 4.5:1 text, ≥ 3:1 large text/UI).

---

## 12. Accessibility (WCAG 2.2 AA)

See [`.github/instructions/a11y.instructions.md`](../.github/instructions/a11y.instructions.md) for the full rule set. Highlights specific to this app:

- Status updates via `aria-live`; errors announced and focusable (`role="alert"`).
- Generated images get meaningful `alt` (prompt text, truncated).
- Colour never the sole signal (status uses icon + text; pricing tier uses `$`/`$$`/`$$$` text, not colour alone).
- Respect `prefers-reduced-motion`.
- Run the `Accessibility Ally` agent before release.

---

## 13. Security

- Client-only; the user's key is sent directly to OpenRouter. **Never** logged; never stored in IndexedDB or in `requestSnapshot`.
- Default sessionStorage; localStorage only on explicit opt-in with a danger admonition (XSS/persistence risk).
- No third-party scripts beyond the build's own bundle.
- Generated content rendered as images from Blobs; model text never rendered via `innerHTML`. The View-source panel is text-only and redacts the key.
- Reference images validated by MIME (PNG/JPEG/WebP only); stored and sent at full resolution (no downscaling).

---

## 14. Out of scope

- **Free / draggable canvas — never.**
- Backend, multi-user, accounts, server-side key storage — never.
- Streaming responses.
- **Per-card model choice** — model is chain-locked; per-card is a possible future addition.
- **Per-chain style docs / reference images** — style doc and refs are global; per-chain is a possible future addition.
- Multiple boards/projects UI (data model allows it; the app ships a single board).
- Export/import of boards.
