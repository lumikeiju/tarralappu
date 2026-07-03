<!-- @format -->

# Tarralappu — Implementation Plan (v1)

Handoff spec for implementation. Read top to bottom before writing code. Every decision here is locked unless flagged **OPEN**.

---

## 1. What this is

**Tarralappu** (Finnish: "sticky note / label") is a single-page, client-only web app that acts as a **harness for AI image generation** through [OpenRouter](https://openrouter.ai). The user brings their own OpenRouter API key, picks an image-capable model, writes a global **style document**, optionally attaches a **style reference image** and a **layout reference image**, then spawns any number of **sketches** (generation attempts). Each sketch can be **refined** in a left-to-right **chain** (row). The aesthetic is a **sticky-note board** with **dark and light themes**.

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
        "format": "prettier --write ."
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
prettier.config.mjs              (exists)
.github/workflows/deploy.yml     (new — GH Pages)
docs/implementation-plan.md      (this file)
src/
  main.ts
  App.svelte
  app.css                        (global tokens + theme + reset)
  lib/
    openrouter/
      types.ts                   (request/response/model TS types)
      client.ts                  (fetch wrappers: chatCompletion, listModels)
      capabilities.ts            (capability inference + MODEL_CAPABILITY_OVERRIDES)
      compose.ts                 (message composition: conversational + i2i, ref labeling)
      cost.ts                    (pre-send estimate + parse usage)
    queue/
      queue.ts                   (concurrency-limited job runner)
    state/
      settings.svelte.ts         (key, model, theme, caps, concurrency)
      board.svelte.ts            (board/chains/sketches reactive store)
    db/
      schema.ts                  (idb open + object stores)
      repo.ts                    (CRUD: boards/chains/sketches/images/settings)
      images.ts                  (dataURL<->Blob, objectURL lifecycle)
    util/
      id.ts                      (crypto.randomUUID wrapper)
      result.ts                  (Result<T,E> helper)
  components/
    SetupBar.svelte              (key entry + theme toggle + cost meter + concurrency)
    ApiKeyPanel.svelte
    NewChainComposer.svelte      (model picker + first prompt; creates a chain-locked row)
    ModelPicker.svelte           (pinned + expand-all + filter; used by NewChainComposer)
    StyleDocPanel.svelte
    ReferenceImages.svelte
    Board.svelte
    Chain.svelte                 (one row; shows locked-model badge + chain cost cap)
    SketchCard.svelte
    NewSketchButton.svelte
    AttachmentChecks.svelte
    ResolutionControls.svelte
    CardActions.svelte           (view-source, trash-cascade, refresh/fork, retry)
    CostMeter.svelte
    ThemeToggle.svelte
    Admonition.svelte            (warning / danger callouts, e.g. <!>)
```

---

## 4. Domain model (TypeScript)

Keep these in `lib/state` / `lib/db/schema.ts` as appropriate.

```ts
type ID = string; // crypto.randomUUID()

interface BoardSettings {
    defaultModelId: string | null; // pre-fills the model picker when starting a NEW chain (model is chain-locked, not global)
    styleDoc: string; // global "how it should look"
    styleRefImageId: ID | null; // stored image (role: styleRef)
    layoutRefImageId: ID | null; // stored image (role: layoutRef)
    sessionCostCapUsd: number | null; // null = no cap
    defaultAspectRatio: string; // e.g. "1:1"
    defaultImageSize: string; // e.g. "1K"
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
    forkedFrom?: { chainId: ID; sketchOrder: number } | null; // provenance when created via fork
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
    modelId: string; // mirrors chain.modelId (denormalised; chain-locked in v1)
    prompt: string; // per-sketch subject (root) or refinement (child)
    attach: AttachFlags;
    aspectRatio: string;
    imageSize: string;
    status: SketchStatus;
    error: string | null;
    costEstimateUsd: number | null;
    costActualUsd: number | null;
    resultImageIds: ID[]; // generated image(s); some models return >1. Display first as primary.
    requestSnapshot?: SketchRequestSnapshot; // lightweight: params + prompt + referenced image IDs, NOT raw base64 (see §6.6/§8)
    createdAt: number;
}

interface StoredImage {
    id: ID;
    role: "generated" | "styleRef" | "layoutRef";
    blob: Blob; // store as Blob, not data URL
    mime: string;
    width?: number;
    height?: number;
    refCount: number; // # of sketches referencing it; forks share image IDs. Delete only at 0.
    createdAt: number;
}

// Lightweight, base64-free record of what was sent (powers View source §6.6 + retry).
interface SketchRequestSnapshot {
    model: string;
    modalities: ("image" | "text")[];
    image_config?: { aspect_ratio?: string; image_size?: string };
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
- **Model discovery:** `GET https://openrouter.ai/api/v1/models?output_modalities=image`

Headers on every call:

```
Authorization: Bearer <key>
Content-Type: application/json
HTTP-Referer: https://lumikeiju.dev/tarralappu/   (optional ranking metadata)
X-Title: Tarralappu                                (optional ranking metadata)
```

> **`GET /models` is public** — it needs no API key. Fetch the model list (and capabilities) on first load so the picker is populated before the user enters a key. The key is required only for **generation**.

### 5.2 Request body (generation)

```jsonc
{
    "model": "<modelId>",
    "messages": [/* see §6 composition */],
    "modalities": ["image", "text"], // or ["image"] for image-only models
    "image_config": { "aspect_ratio": "16:9", "image_size": "2K" },
    "usage": { "include": true }, // request usage accounting for cost
    "stream": false
}
```

- **`modalities` is model-dependent.** Text+image models use `["image","text"]`; image-only models (Flux, Sourceful) use `["image"]`. Derived from capability map (§5.4). Sending the wrong one fails.
- `image_config` keys included only when the model supports them; values constrained to that model's allowed set (§5.4).

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
            }
        }
    ],
    "usage": {/* tokens + cost when usage.include=true */}
}
```

- Generated image = `choices[0].message.images[].image_url.url` (base64 data URL → convert to Blob, store).
- **Guard:** if `images` is missing/empty → treat as error state "no image returned" (per §10).

### 5.4 Capability model — the crux

The Models API exposes `id`, `name`, `architecture.input_modalities`, `architecture.output_modalities`, `pricing`, and `supported_parameters`. It does **NOT** reliably expose:

- whether the model supports **multi-turn conversational image editing**, or
- the **max number of input images**, or
- the exact **aspect-ratio / image-size** matrix.

Therefore maintain a **static override table merged over inferred defaults**:

```ts
interface ModelCapabilities {
    id: string;
    name: string;
    modalities: ("image" | "text")[]; // from architecture.output_modalities
    conversational: boolean; // multi-turn image editing supported?
    maxInputImages: number; // hard cap for attachments
    aspectRatios: string[]; // allowed image_config.aspect_ratio
    imageSizes: string[]; // allowed image_config.image_size
    supportsImageConfig: boolean;
    pricing: ModelPricing; // from API
}
```

- **Inference defaults** (when no override):
    - `modalities` ← `architecture.output_modalities`.
    - `conversational` ← `output_modalities` includes `"text"` (text+image models are generally conversational; image-only are not).
    - `maxInputImages` ← `1` if not known (conservative; overrides raise it).
    - `aspectRatios` / `imageSizes` ← the OpenRouter shared defaults documented for image generation (1:1…21:9; 0.5K/1K/2K/4K), trimmed by overrides.
    - `supportsImageConfig` ← true unless override says otherwise.
- **`MODEL_CAPABILITY_OVERRIDES`**: keyed by model id and by family prefix (e.g. `google/gemini-*`, `black-forest-labs/flux*`, `microsoft/mai-image-*`, `openai/gpt-*image*`, `recraft/*`, `sourceful/*`). Hand-curate the pinned defaults and known families using the OpenRouter image-generation docs. Exact-id override wins over family override wins over inference.
- **Pinned defaults** in the model picker (expandable to the full dynamic list): the four named examples plus any returned that match a curated pin list. Pins are display-order only; all image-output models from the live query are selectable when expanded.

**OPEN-1:** The override table is the one place that needs manual curation/maintenance. Seed it from the docs at build time; treat unknown models conservatively (1 input image, no conversational, shared aspect/size set) and surface a small "capabilities estimated" note in the UI when relying purely on inference.

### 5.5 Cost

- **Pre-send estimate:** compute from the model's `pricing` (image/request/token fields) × requested size. Image pricing is often per-image or per-megapixel; read the model's `pricing` object and estimate conservatively. The estimate for a **conversational refinement must price the full resent thread** (text + all history images), which grows each turn. Display with an explicit "estimate, may be inexact" caveat.
- **Prompt caching:** much of a resent thread typically hits OpenRouter/provider **prompt cache at a discount**, so real cost is usually **below** the naive full-thread estimate. Treat estimates as an upper-ish bound and lean on `costActualUsd` for the source of truth.
- **Actual cost:** read from `usage` in the response (requested via `usage.include = true`). If absent for a given image model, fall back to `GET /api/v1/generation?id=<id>` using the response id and read total cost. Persist `costActualUsd` on the sketch.
- **Caps (§9).**

**OPEN-2:** Confirm the precise pricing fields for image models against a live `GET /models` response during M1; adjust `cost.ts` accordingly.

---

## 6. Request composition (`compose.ts`)

Pure functions that turn board state + a sketch into an OpenRouter request body. Two modes.

### 6.1 Attachment assembly

Global assets attach per the sketch's `AttachFlags`:

- **Style document** (`attach.styleDoc`): prepended into the user text.
- **Style reference image** (`attach.styleRef`): added as an `image_url` part.
- **Layout reference image** (`attach.layoutRef`): added as an `image_url` part.

**Reference labeling (conversational models):** because the API gives images no semantic role, prepend explicit labels in the text, ordered to match image order. Only label what's attached. Example user text:

```
[STYLE GUIDE]
<styleDoc>

The first attached image is a STYLE REFERENCE — match its palette, texture, lighting, and mood; do not copy its subject.
The second attached image is a LAYOUT REFERENCE — match its composition and element placement; ignore its colours and content.

[REQUEST]
<sketch prompt>
```

Images array order MUST match the label order (style ref first, layout ref second). Omit a label line when its image isn't attached and shift ordering accordingly.

### 6.2 Input-image count enforcement

The cap applies to the **whole outgoing request** (all `image_url` parts across all messages), not just the current turn:

- **Default (A):** trust the model's `maxInputImages` and enforce only per-request. Conversational models get a high override reflecting their multi-image tolerance, so normal chains pass.
- **Fallback (B):** if a composed request would still exceed `maxInputImages`, **truncate conversation history to the most recent assistant image** before counting again.
- **Block only as a last resort:** after truncation, if the user's explicitly attached refs (styleRef + layoutRef + parent image on i2i) still exceed the cap, block the send and tell the user to uncheck attachments. (Decision #8.2 + Q4.)

### 6.3 Root sketch

`messages` = single `user` message with `content` parts: `[text, ...attachedImages]`. `modalities` per capability.

### 6.4 Refinement — conversational models

Walk the chain from root to the current sketch's parent and rebuild the full thread:

```
[
  user(turn1 text + attached refs/images),
  assistant(content + images: [parentResultImage]),
  user(turn2 refinement text + optionally re-attached refs),
  assistant(...),
  ...
  user(current refinement text)
]
```

Resend prior assistant images in history so the model can edit them. **Re-attaching style/layout refs on a refinement defaults OFF** — refs from earlier turns already persist in the resent history, so re-sending is wasteful. The user can re-check a ref on a refinement only if the style has drifted and they want to reassert it. (Q4.)

### 6.5 Refinement — image-only fallback

For non-conversational models, a refinement is a **single-step image-to-image**: one `user` message containing the refinement text + the **parent sketch's generated image** as an `image_url` part (+ any checked refs, subject to the input-image cap). `modalities: ["image"]`. The UI must show a `<!>` warning (via `Admonition.svelte`) when a non-conversational model is selected, explaining refinements lose conversation context. (Decision #4.2/#4.3.)

### 6.6 View source (raw request) — per card

Every sketch card exposes a **"View source"** control (a `</>`-style button) that reveals the **exact request body that will be (or was) sent** for that card.

- The body is produced by the **same `compose.ts` functions** the queue uses — never a separate code path — so what the user sees is authoritative.
- For a `draft`/`queued` card it shows the request **as it would be sent now**; for a `done`/`error` card it shows the **snapshot of what was sent** (reconstructed from `requestSnapshot`).
- **Image parts are elided, never raw base64**: render image parts as `{ type: "image_url", image_url: { url: "data:image/png;base64,…<2.1 MB, imageId=…>" } }`. This keeps the view readable and avoids dumping megabytes.
- The displayed JSON **omits the `Authorization` header / API key entirely**. Headers shown (if any) are redacted.
- Provide a **copy-to-clipboard** action on the elided JSON. Render as text only (never `innerHTML`).
- `SketchRequestSnapshot` persists only: `model`, `modalities`, `image_config`, the composed message text, and the **image IDs** referenced per message — enough to faithfully redisplay without storing base64 twice.

---

## 7. State architecture (Svelte 5 runes)

- **`settings.svelte.ts`** — reactive singleton holding: `apiKey` (in memory; mirrored to sessionStorage, or localStorage if "remember" opted in), `rememberKey: boolean`, `defaultModelId` (pre-fills new chains; model is chain-locked, not global), `theme`, `concurrency`, and cap values. Hydrated from storage on load.
- **`board.svelte.ts`** — reactive board graph: the board, its chains (rows), and sketches. Exposes derived selectors: `chainsOrdered`, `sketchesByChain`, `sessionCostTotal`, `chainCostTotal(chainId)`. Mutations write through to IndexedDB (`repo.ts`) and update runes state optimistically.
- Capability data: `availableModels: ModelCapabilities[]` plus `capabilitiesFor(modelId)` — each **chain** resolves capabilities from its locked `modelId`; the new-chain composer resolves from the pending model selection. Drives which checkboxes/resolutions are enabled and the conversational/i2i warning per row.

Persistence is **write-through**: every mutation updates runes state and the matching IndexedDB record. On load, hydrate runes from IndexedDB. Image blobs are loaded lazily and exposed as object URLs (created on mount, revoked on unmount) — never hold data URLs in reactive state long-term.

---

## 8. Persistence (IndexedDB via `idb`)

DB name `tarralappu`, version 1. Object stores (all keyed by `id`):

| Store      | Key  | Indexes                          |
| ---------- | ---- | -------------------------------- |
| `boards`   | `id` | —                                |
| `chains`   | `id` | `boardId`, `order`               |
| `sketches` | `id` | `chainId`, `parentSketchId`      |
| `images`   | `id` | `role`                           |
| `settings` | `id` | single `app` record (key, prefs) |

Rules:

- Store generated/reference images as **`Blob`** in `images` (convert from the response data URL immediately). Never store multi-MB data URLs in `localStorage`.
- API key: **sessionStorage** by default. If `rememberKey` is checked (with the danger admonition shown), persist to **localStorage**. Never put the key in IndexedDB.
- On board load, recreate object URLs for visible images; revoke on teardown to avoid leaks.
- **Never persist raw base64 request bodies.** `requestSnapshot` stores params + composed text + referenced image **IDs** only (§6.6); image bytes live once, in `images`.
- **Image deletion is refcount-aware.** Forks share `StoredImage` IDs, so trashing a sketch decrements `refCount` and deletes the blob only when it reaches 0. Reference images are also refcounted (a global ref used by many sketches survives until none reference it).
- Provide an explicit **"clear board"** / **"delete image"** path; trashing a sketch cascades to its descendants (§11 Card actions) and decrements image refcounts accordingly.

---

## 9. Queue, concurrency, cost caps (`queue/queue.ts`)

- A promise-based queue with a **configurable concurrency cap** (default **2**, user-adjustable in settings).
- A job = `{ sketchId }`. Lifecycle drives `Sketch.status`: `queued → generating → done | error`.
- **Retry** re-enqueues the same sketch (status back to `queued`), reusing/rebuilding the request.
- **Cost gating before dispatch:**
    - Compute `costEstimateUsd`.
    - If `sessionCostCapUsd != null` and `sessionCostTotal + estimate > cap` → block, mark card `error` with a "session cost cap would be exceeded" message (not auto-retried).
    - Same check against the sketch's chain `chainCostCapUsd`.
    - Always show the "estimates may be inexact" caveat near caps.
- After success, record `costActualUsd`; totals recompute via derived selectors.
- **Cancellation.** Every job holds an `AbortController`. **Trashing a `queued` or `generating` card cancels its job** — abort the in-flight `fetch` (or drop it from the queue), discard any partial result, and proceed with the trash. A cancelled job records no cost.
- **No streaming** — single request/response; show a generating state until the image arrives.

---

## 10. Per-card states & errors (`SketchCard.svelte`)

States: `draft` (editable, not yet sent), `queued`, `generating` (spinner + aria-live), `done` (image + actual cost), `error` (message + **Retry**).

Map common failures to clear messages:

| Condition | Message |
| --- | --- |
| 401 | Invalid or missing API key. |
| 402 | Insufficient OpenRouter credits. |
| 429 | Rate limited — will retry / try again shortly. |
| Response without `images` | Model returned no image. Try a different prompt or model. |
| Input images > capability | Too many references for this model — uncheck some (blocking). |
| Cost cap would exceed | Session/chain cost cap would be exceeded. |

`aria-live="polite"` region announces status transitions. Errors are focusable.

---

## 11. Layout & UI

### Structure

- **SetupBar** (top, sticky): API key panel, theme toggle, **CostMeter** (session total vs cap), concurrency setting. (No model picker here — model is chain-locked, chosen per chain.)
- **Global authoring panel:** StyleDocPanel (textarea) + ReferenceImages (style ref + layout ref upload/preview/remove). Uploads are **MIME-validated** (accept PNG/JPEG/WebP only, reject others) and stored/sent at **full resolution — no downscaling** (request size is bounded only by the model's own input limits).
- **Board:** vertical stack of **Chains**. Each **Chain is a ROW**: the root sketch on the left, refinements extending **to the right**; a **"+ New Sketch"** control adds a new root (new row). Creating a new chain opens a composer containing the **ModelPicker** (pinned defaults + expand-all + text filter, pre-filled from `defaultModelId`); the chosen model is **locked for that row** and shown as a row label/badge. A refine control sits at the right end of each row (enabled only once the rightmost card is `done`). Per-row cost cap input + chain cost total.

### Sketch card contents

- Prompt textarea.
- **AttachmentChecks**: "Attach Style Description", "Attach Style Reference", "Attach Layout Reference" — each disabled if the corresponding global asset is absent; checking beyond `maxInputImages` is blocked with inline explanation.
- **ResolutionControls**: aspect-ratio + size selectors, populated **only** with the current model's allowed values; invalid combos impossible to select.
- **View source** (`</>`) button revealing the raw request body for this card (§6.6).
- **Trash** (cascade) and **Refresh** (fork/re-roll) buttons — see Card actions below.
- Generate/Refine button, status, result image, estimated/actual cost. **Retry** appears only on `error` cards.

### Card actions: trash (cascade) & fork (re-roll)

Completed sketches are **immutable** — you never edit a generated card in place. Two actions branch or prune the tree:

- **Trash (cascade).** Trashing a card removes that card **and all descendants to its right** in the row (chain `1→2→3→4`: trash `4` removes `4`; trash `2` removes `2,3,4`; trash the root removes the whole row/chain). Flow: click trash → the card and every doomed descendant get a **"pending-trash" style** (e.g. dimmed + red outline) so the blast radius is visible → explicit **confirm** click commits; anything else cancels. Trashing a card that is `queued`/`generating` **cancels its job** (§9) before removal. Deletion decrements image `refCount`s (§8); shared-with-a-fork images survive.
- **Fork (re-roll via Refresh).** The Refresh button forks the chain **up to that card** into a **new row**: ancestors `root…parent(card)` are copied as new sketch rows that **reuse the originals' images** (shared `StoredImage` IDs, refcount++), and the forked position becomes a **new editable `draft`** pre-filled with that card's prompt/attachments. The user tweaks the prompt and clicks Generate to produce the variation **in the new fork**; the original chain is untouched. The new chain inherits the source chain's locked model and records `forkedFrom`. This is the immutable-safe way to "try again differently" (leaving the prompt unchanged simply re-rolls a variation).

**Retry vs Refresh:** _Retry_ (error cards only) re-enqueues the **same** request on the **same** card. _Refresh_ (done cards) **forks** into a new row with an editable draft. They are distinct controls.

### Sticky-note aesthetic

- Paper-like cards (subtle texture, soft shadow, slight tape/pin accent). **Keep rotation minimal and decorative only** — never rotate text enough to harm readability. **No handwriting font for body/UI text**; an accent display font may be used for headings only if it still meets contrast and legibility. Respect `prefers-reduced-motion` (no wobble/animation when set).

---

## 12. Theme system

- CSS custom properties in `app.css`; `:root[data-theme="light"]` and `:root[data-theme="dark"]` token sets.
- Default from `prefers-color-scheme`; manual **ThemeToggle** overrides and persists choice in `localStorage`.
- Both themes must meet **WCAG 2.2 AA** contrast (≥ 4.5:1 text, ≥ 3:1 large text/UI). Sticky-note colours chosen so foreground text passes in both modes.

---

## 13. Accessibility (WCAG 2.2 AA)

- All controls keyboard-operable; visible focus indicators; logical tab order.
- Checkboxes/labels properly associated; image uploads have labels and previews have `alt`.
- Status updates via `aria-live`; errors announced and focusable.
- Generated images get meaningful `alt` (e.g. the prompt text, truncated).
- Colour never the sole signal (status uses icon + text).
- Respect `prefers-reduced-motion`.
- Run the `Accessibility Ally` agent before release.

---

## 14. Security

- Client-only; user's key sent directly to OpenRouter. **Never** log the key; never put it in IndexedDB or in `requestSnapshot`.
- Default sessionStorage; localStorage only on explicit opt-in with a **danger admonition** spelling out XSS/persistence risk.
- No third-party scripts beyond the build's own bundle (reduces XSS surface that could exfiltrate the key).
- Generated content rendered as images from Blobs; never `innerHTML` model text — render as text only. The **View source** panel (§6.6) is text-only and redacts the key.
- `requestSnapshot` and the View-source output must **omit** the `Authorization` header / key, and must **elide image base64** rather than persist or display it.
- Validate uploaded reference images by **MIME** (PNG/JPEG/WebP only); they are stored and sent at **full resolution** (no downscaling, per decision).

---

## 15. Template cleanup (part of v1)

Rewrite to describe Tarralappu (no "Peruskivi" language left):

- `README.md` — what it is, screenshots, local dev (`bun install`, `bun run dev`), build/deploy, "bring your own OpenRouter key" note, link to Silmärin docs at `https://lumikeiju.dev/silmarin/tarralappu/`.
- `AGENTS.md` — replace the template "Repo identity" with Tarralappu's; keep the conventions section; set apex mode = **standalone/external**, slug `tarralappu`.
- `CHANGELOG.md` — start at `0.1.0` with the v1 feature set.
- `package.json` — `name`, `description`, `version` 0.1.0, scripts (§2).
- Add `.github/workflows/deploy.yml` building with Bun and publishing `dist/` to GitHub Pages (base `/tarralappu/`).
- Register the project as `external` on the apex registry (manual, out of this repo).

---

## 16. Build order (milestones)

Each milestone is independently committable (Conventional Commits) and leaves the app runnable.

- **M0 — Scaffold.** Vite+Svelte+TS, base path, Prettier/svelte-check, Pages workflow, template cleanup (§15). App renders an empty themed shell.
- **M1 — Key + models.** API key panel (sessionStorage + remember opt-in + danger admonition). Model discovery via the **public** `/models` (no key needed), capability map + overrides, model picker (pins + expand-all + filter). Verify pricing fields live (OPEN-2).
- **M2 — Authoring + persistence.** StyleDocPanel, ReferenceImages, IndexedDB schema/repo, image Blob storage, write-through state, hydrate on load.
- **M3 — Root generation.** One root sketch, no attachments, end-to-end: compose → send → parse → store image → display. Per-card states.
- **M4 — Attachments + resolution.** Checkboxes (style doc/ref/layout) with capability gating, reference labeling, input-image cap enforcement, model-aware ResolutionControls.
- **M5 — Chains + refinement + branching.** Rows with **chain-locked model** (ModelPicker in the new-chain composer), conversational thread rebuild, image-only i2i fallback + `<!>` warning, refine control. **Trash (cascade) with pending-trash preview + confirm**, and **Refresh = fork-to-new-row** with editable draft and shared (refcounted) ancestor images.
- **M6 — Queue.** Concurrency-capped runner, queued/generating transitions, retry.
- **M7 — Cost.** Pre-send estimate, actual cost from usage/generation endpoint, session + chain caps with gating, CostMeter, inexact-estimate caveats.
- **M8 — Theme + a11y.** Sticky-note styling both themes, reduced-motion, full a11y pass (Accessibility Ally), contrast checks.
- **M9 — Polish.** Error-message coverage, empty/loading states, delete/clear flows, README screenshots, CHANGELOG finalise.

---

## 17. Out of scope (v1 and/or forever)

- **Free / draggable canvas — never.**
- Backend, multi-user, accounts, server-side key storage — never.
- Streaming responses (v1).
- **Per-card model choice** — model is chain-locked in v1; per-card is a _maybe_ later (high complexity).
- **Per-chain style docs / reference images** — style doc and refs are global in v1; per-chain is in scope but post-MVP.
- Multiple boards/projects UI (data model allows it; v1 ships a single board).
- Export/import of boards (candidate for v1.1).

---

## 18. Open items to confirm during build

- **OPEN-1:** Curate `MODEL_CAPABILITY_OVERRIDES` from the OpenRouter image-gen docs; conservative fallback for unknown models + a "capabilities estimated" UI hint.
- **OPEN-2:** Confirm exact image pricing fields and the `usage.include` / `GET /generation` cost path against live responses in M1; finalise `cost.ts`.
