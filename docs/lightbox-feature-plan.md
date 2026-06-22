<!-- @format -->

# Feature Plan: Image Lightbox ("zoom" popup)

Handoff spec for the implementing agent. Add a small magnifying-glass button to the top-right of each generated image. Clicking it opens the image in a minimal, glightbox-style overlay so the user can inspect detail without leaving the page.

Stack: Vite + Svelte 5 (runes) + TS. Tokens in [`src/app.css`](../src/app.css). Conform to [WCAG 2.2 AA](../.github/instructions/a11y.instructions.md). No new dependencies — use the native `<dialog>` element.

---

## Why native `<dialog>` (not a library, not a custom div)

`glightbox` and friends are overkill for a single, already-loaded image. The native `<dialog>` opened with `.showModal()` gives us, for free and accessibly:

- Top-layer rendering — sits above the sticky SetupBar with no `z-index` battles.
- Built-in focus trap + focus restore to the trigger on close.
- `Escape` to dismiss.
- The rest of the page becomes inert automatically.
- A `::backdrop` pseudo-element for the dimming layer.

This keeps the feature tiny and robust. Do not hand-roll a focus trap.

---

## Scope

- Trigger appears only on cards in the `done` state that actually have a rendered image (i.e. where `imageUrl` is set in [`SketchCard.svelte`](../src/components/SketchCard.svelte)).
- Shows the single displayed result image (`sketch.resultImageIds[0]`, already loaded as `imageUrl`). Multi-image carousels / prev-next arrows are **out of scope**.
- Minimal chrome: dim backdrop, centered image fit to viewport, one close button. No thumbnails, no captions bar, no zoom-pan (see stretch goals).

---

## Tasks

### 1 — New `Lightbox.svelte` component

Create `src/components/Lightbox.svelte`. Self-contained and reusable.

Props:

```ts
const {
    src, // object URL of the image
    alt, // descriptive alt text (reuse the card's alt)
    open, // boolean — controlled by parent
    onClose // () => void
}: {
    src: string;
    alt: string;
    open: boolean;
    onClose: () => void;
} = $props();
```

Behaviour:

- Hold a `let dialogEl: HTMLDialogElement` via `bind:this`.
- `$effect` syncs `open` → imperative dialog state:
    - `open && !dialogEl.open` → `dialogEl.showModal()`.
    - `!open && dialogEl.open` → `dialogEl.close()`.
- Listen for the dialog's native `close` event (fires on `Escape` too) and call `onClose()` so the parent's `open` state stays in sync.
- Backdrop dismiss: `onclick` on the `<dialog>`; if `event.target === dialogEl` (the backdrop, not the image), call `onClose()`. Because the image/figure is a child, clicks on the image won't bubble a dismiss.
- Close button: icon button (`✕`) pinned top-right of the dialog with `aria-label="Close image viewer"`.

Markup sketch:

```svelte
<dialog
    bind:this={dialogEl}
    class="lightbox"
    aria-label="Image viewer"
    onclick={onBackdrop}
    onclose={onClose}
>
    <button
        class="lightbox__close btn-icon"
        onclick={onClose}
        aria-label="Close image viewer">✕</button
    >
    <img class="lightbox__img" {src} {alt} />
</dialog>
```

Styling (tokens only, add any new ones to `app.css`):

- `.lightbox` (the dialog): transparent background, no border, `max-width`/`max-height` unset so the image can be large; center its contents (flex).
- `.lightbox::backdrop`: `background: rgba(0,0,0,0.78)`; add a short fade-in **gated behind `@media (prefers-reduced-motion: no-preference)`**.
- `.lightbox__img`: `max-width: 92vw; max-height: 92vh; width: auto; height: auto;` `object-fit: contain;` plus a subtle frame consistent with the in-card photo treatment (white inset border + shadow). Must scale per the a11y reflow rule.
- `.lightbox__close`: absolutely positioned top-right; ensure ≥ 24×24px target (WCAG 2.5.8); high-contrast on the dark backdrop (white icon, semi-opaque dark pill); `:focus-visible` uses the existing transparent-outline + box-shadow pattern.
- Optional entrance: image `transform: scale(0.96)` → `1` + opacity fade, reduced-motion gated, ≤ 150ms.

### 2 — Wire the trigger into `SketchCard.svelte`

File: [`src/components/SketchCard.svelte`](../src/components/SketchCard.svelte).

- Add `let lightboxOpen = $state(false);`.
- In the existing `.result-image` overlay block (which already holds the cost chip), add a magnifying-glass icon button in the **top-right** corner:

    ```svelte
    <button
        class="zoom-btn"
        onclick={() => (lightboxOpen = true)}
        aria-label="View image full size"
        title="Zoom">🔍</button
    >
    ```

    - Position it `absolute; top: 6px; right: 6px;` (mirror `.cost-chip`, which is bottom-right, so they don't collide).
    - Style as a semi-opaque dark pill matching `.cost-chip` (reuse those values; add a shared class or token). White glyph for contrast on arbitrary image content.
    - Keep it ≥ 24×24px; visible `:focus-visible` ring.

- Render the lightbox once per card, after the image block:

    ```svelte
    {#if imageUrl}
        <Lightbox
            src={imageUrl}
            alt={sketch.prompt.slice(0, 120) || "Generated image"}
            open={lightboxOpen}
            onClose={() => (lightboxOpen = false)}
        />
    {/if}
    ```

- Reuse the **existing** `imageUrl` object URL — do not create a second one. The `onDestroy` revoke in `SketchCard` already covers its lifecycle; the dialog is a child, so no extra cleanup is needed.

### 3 — Decorative glyph accessibility

- The 🔍 / ✕ are decorative glyphs inside buttons that carry real `aria-label`s, so the emoji should not be separately announced. If a screen reader double-announces, wrap the glyph in `<span aria-hidden="true">`. Prefer an inline SVG using `currentColor` (forced-colors safe) over an emoji if visual consistency across platforms matters.

---

## Accessibility checklist (must pass)

- Trigger + close are real `<button>`s with `aria-label`s matching their meaning (2.5.3, 4.1.2). Icon-only → label required.
- `Escape` closes; focus returns to the magnifying-glass trigger automatically (native `<dialog>` behaviour) (2.1.2 no keyboard trap, 2.4.3 focus order).
- Focus is trapped within the dialog while open (native).
- Backdrop click closes without breaking keyboard flow.
- `:focus-visible` indicators use the transparent-`outline` + `box-shadow` pattern so they survive forced-colors mode.
- Backdrop dimming is not the _only_ signal — the image is framed and centered.
- Image scales within viewport; page still reflows to 320px (2.1.4 / 1.4.10).
- All transitions gated behind `prefers-reduced-motion: no-preference`.
- Buttons meet the 24×24px minimum target size (2.5.8).
- Re-run the **Accessibility Ally** agent after implementation.

## Verification

- `bun run check` and `bun run build` stay at 0 errors / 0 warnings.
- Manual / browser-tab test (use FLUX.2 Klein 4B + the test key): generate an image, click the magnifier, confirm the overlay opens, `Escape` and backdrop-click and the ✕ button all close it, and focus lands back on the trigger. Screenshot light + dark.

## Stretch goals (explicitly out of scope for v1)

- Click-to-zoom to natural resolution with scroll/pan.
- Prev/next navigation across a chain's images.
- A caption strip showing the full prompt and cost inside the lightbox.
