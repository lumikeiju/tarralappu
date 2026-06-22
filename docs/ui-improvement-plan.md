<!-- @format -->

# Tarralappu UI Improvement Plan

Handoff spec for the implementing agent. Goal: turn the current "functional but basic" UI into a tactile **sticky-note / corkboard** experience without sacrificing the WCAG 2.2 AA conformance already in place. Work top-to-bottom; P0 items are the concrete asks, P1–P3 are the aesthetic overhaul.

Stack reminder: Vite + Svelte 5 (runes) + TS. Tokens live in [`src/app.css`](../src/app.css). Respect `prefers-reduced-motion` and `prefers-color-scheme` everywhere. Never hardcode hex in components — add tokens.

---

## P0 — Concrete fixes (must ship)

### P0.1 — Hide the prompt while a card is generating/queued

File: [`src/components/SketchCard.svelte`](../src/components/SketchCard.svelte)

Current behaviour: the `{:else}` branch renders `<p class="prompt-display">{sketch.prompt}</p>` for every non-draft/non-error state, so `queued` and `generating` cards dump the entire prompt (see screenshot — the GPT-5.4 card shows the full style doc).

Required behaviour:

- `draft` / `error`: editable textarea (unchanged).
- `queued` / `generating`: do **not** render the full prompt. Show a compact placeholder block instead:
    - A one-line clamped summary: first ~60 chars of `sketch.prompt` with `text-overflow: ellipsis; white-space: nowrap; overflow: hidden;` (CSS, not JS slicing, so the accessible text stays whole).
    - The spinner + status already live in `.card-header`; keep them.
    - Reserve vertical space with a shimmer/placeholder rectangle where the image will appear (a `.image-skeleton` block sized by the card's `aspectRatio`), so the card doesn't jump when the image arrives.
- `done`: show the clamped one-line prompt **above** the image (caption style), not the full text. Add a `title={sketch.prompt}` and let it expand on hover/focus via a details/disclosure if the user wants the full text — keep it out of the default flow.

Acceptance: a generating card is at most ~1 line of text tall plus the image skeleton; no multi-paragraph prompt dump.

### P0.2 — Authoring bar sub-sections become individual post-its

Files: [`src/App.svelte`](../src/App.svelte) (`.authoring-body` grid), [`src/components/StyleDocPanel.svelte`](../src/components/StyleDocPanel.svelte), [`src/components/ReferenceImages.svelte`](../src/components/ReferenceImages.svelte).

Today the three columns (Style Guide, Reference Images, Session Cost Cap) are bare `div.authoring-col` with no visual separation. Wrap each in the shared post-it treatment from P1.1 so they read as three distinct notes pinned to the bar:

- Give `StyleDocPanel`, `ReferenceImages`, and the inline Session-cost-cap block each a `.post-it` wrapper (or a `<NotePanel>` component — see P1.2).
- Vary the note tint per panel using `--note-*` tokens (e.g. Style Guide = yellow, Reference Images = green, Session Cap = blue) so they're distinguishable at a glance.
- Keep the existing headings/labels and `aria-describedby` wiring intact.
- The Session Cost Cap block is currently inline JSX in `App.svelte`; extract it into its own small component `src/components/SessionCapPanel.svelte` for parity, OR keep inline but wrap in the same `.post-it`. Prefer extraction for cleanliness.

Acceptance: three visually separated notes with their own background, tape, and subtle offset; spacing between them is comfortable (≥ `--sp-4`).

---

## P1 — Core post-it system (foundation for everything else)

### P1.1 — Real sticky-note tokens + `.post-it` / upgraded `.card`

File: [`src/app.css`](../src/app.css)

The current `.card` is a flat rectangle with a faint center tape stub. Make it feel like paper:

1. **Note color palette tokens.** Add a small set of note tints for light and dark themes (and `[data-theme]` overrides). Each note color needs a `bg`, a slightly darker `edge` (for the bottom shadow/fold), and a readable `text` that still hits 4.5:1 on that bg:

    ```
    --note-yellow-bg / --note-yellow-edge
    --note-green-bg  / --note-green-edge
    --note-blue-bg   / --note-blue-edge
    --note-pink-bg   / --note-pink-edge
    --note-default-bg (current --card-bg)
    ```

    Verify contrast for every text/badge token placed on each note in both themes. Dark-theme note tints must be muted (desaturated, low-luminance) so the board stays dark — see P1.4.

2. **Layered, directional shadow** for lift: a tight contact shadow plus a softer ambient one, biased downward (notes hang from their tape). Replace the single `--card-shadow`.

3. **Paper edge.** Add a subtle bottom-right "peel"/fold using a `::after` with a small triangular gradient, or a 2px darker bottom border via `--note-*-edge`. Keep it cheap (no images).

4. **Washi-tape accent.** Upgrade `.card::before`: make the tape wider, semi-transparent (so the note shows through), slightly skewed (`rotate(-2deg)`), with soft torn edges (use a `repeating-linear-gradient` mask or just rounded ends + low opacity). Allow a per-note tape color via `--tape-bg` override.

5. **Hand-placed rotation.** Introduce a `--note-rotation` custom prop (default `0deg`). Apply `transform: rotate(var(--note-rotation))` to notes. On `:hover`/`:focus-within`, straighten to `0deg` and lift slightly. Gate all of this behind `@media (prefers-reduced-motion: no-preference)` and cap rotation at ±1.5°.

### P1.2 — Optional `NotePanel.svelte` wrapper component

To avoid repeating markup, add `src/components/NotePanel.svelte`:

- Props: `color?: 'yellow'|'green'|'blue'|'pink'|'default'`, `rotation?: number`, `tape?: boolean`, plus `title?: string` and a `children` snippet.
- Renders a `section.post-it` with the right `--note-*` and `--note-rotation` inline custom props and an optional heading slot.
- Reuse it for the authoring sub-panels (P0.2) and consider it for chain/card chrome.

### P1.3 — Hand-placed rotation for sketch cards & chains

Files: [`src/components/SketchCard.svelte`](../src/components/SketchCard.svelte), [`src/components/Chain.svelte`](../src/components/Chain.svelte)

- Give each card a small deterministic rotation derived from its id/order (e.g. `((hash(sketch.id) % 5) - 2) * 0.4deg`) so the board looks hand-arranged but stable across renders (don't use `Math.random` — it must not change on re-render).
- Straighten on hover/focus-within. Respect reduced-motion (no rotation at all).

### P1.4 — Dark-mode "corkboard", light-mode "paper desk"

File: [`src/app.css`](../src/app.css) (`body`, board container)

- Replace the flat `--clr-bg` board surface with a subtle texture:
    - Light: warm paper / faint grid (cheap CSS `radial-gradient` dots or a `repeating-linear-gradient` grid at very low contrast).
    - Dark: corkboard-ish speckle (low-opacity noise via layered radial-gradients) or a muted felt tone. Keep it dark enough that muted note tints pop.
- Texture must be `pointer-events: none`, behind content, and contrast-safe (text sits on note backgrounds, not the board, so this is decorative only — but keep it subtle).

---

## P2 — Component polish

### P2.1 — Status badges as note-stickers

File: [`src/components/SketchCard.svelte`](../src/components/SketchCard.svelte)

- Restyle `.status-badge` variants as small rounded "dot + label" pills with a tiny colored indicator dot, consistent across queued/generating/done/error.
- `generating` badge: keep spinner; add a subtle pulsing border (reduced-motion: static).
- Move the `#order` badge to a corner "page number" treatment (small, muted).

### P2.2 — Image presentation

- Frame result images like a photo pinned to the note: inset border, slightly inset from the note edges, small drop shadow distinct from the note's.
- Add a loading skeleton (P0.1) and a graceful broken-image fallback.
- On `done`, show actual cost as a small "receipt" chip in the corner.

### P2.3 — Chain rows as note strips

File: [`src/components/Chain.svelte`](../src/components/Chain.svelte)

- Give the chain header a "label tape" look (model badge as a tape strip).
- Add a faint connector line / arrow between consecutive cards in a chain to convey the refinement lineage (decorative, `aria-hidden`).
- The `+ Refine` affordance at the row end should read as a dashed "add note" ghost card matching `.new-sketch-btn`.

### P2.4 — SetupBar & CostMeter

File: [`src/components/SetupBar.svelte`](../src/components/SetupBar.svelte), [`src/components/CostMeter.svelte`](../src/components/CostMeter.svelte)

- Make the top bar feel like a desk rail / shelf rather than a flat strip (subtle bottom edge highlight + shadow).
- CostMeter progress bar: ensure the track meets 1.4.11 (3:1) — see existing audit note about `--clr-border` track on `--setupbar-bg`. Style the fill as a marker-pen swipe. Turn the bar amber→red as it approaches cap.

### P2.5 — Empty state & New Sketch composer

Files: [`src/components/Board.svelte`](../src/components/Board.svelte), [`src/components/NewChainComposer.svelte`](../src/components/NewChainComposer.svelte)

- Empty board: a friendly "pin your first note" illustration/affordance using the ghost-card style.
- `NewChainComposer` should itself be a fresh blank post-it being written on.

---

## P3 — Typography & micro-interactions

### P3.1 — Accent display font for labels/headings only

- Add **one** humanist/marker-style display font for note titles, status badges, and the app title — loaded `font-display: swap`, self-hosted under `public/` or a system fallback stack (avoid layout shift; no FOIT). Keep all body text, prompts, inputs, and the mono source view in the current legible UI/mono stacks. Do **not** use a script font for anything users must read in bulk (accessibility + dyslexia).
- Define `--font-display` token; apply narrowly.

### P3.2 — Motion polish (reduced-motion gated)

- New cards/notes "drop in" with a short settle animation (translateY + slight rotation easing to rest). Trash confirm: card lifts and fades.
- All gated behind `prefers-reduced-motion: no-preference`. Provide instant non-animated equivalents.

### P3.3 — Focus & hit targets

- Keep the forced-colors-safe `outline: 2px solid transparent; box-shadow` focus pattern already in `app.css`. Ensure rotated notes don't clip focus rings (`overflow: visible` on note wrappers).
- Verify all icon buttons remain ≥ 24×24 CSS px target (2.5.8).

---

## Constraints & guardrails (apply to all tasks)

- **Tokens, not literals.** Every new color/shadow/rotation is a CSS custom property in `app.css` with light + dark + `[data-theme]` values.
- **Contrast.** Re-verify 4.5:1 (text) / 3:1 (UI) for each text/badge token on each new note tint, in both themes. The audit already flagged `--clr-text-3` and the cost-bar track — don't regress.
- **Reduced motion.** All rotation, drop-in, pulse, and straighten effects must collapse under `prefers-reduced-motion: reduce`.
- **No layout shift from fonts.** `font-display: swap` + matched fallback metrics.
- **Determinism.** Card rotations derive from stable ids, never `Math.random`, so they don't jump on re-render.
- **Keep it cheap.** Prefer CSS gradients/masks over raster textures; the bundle is currently ~95 kB JS / ~19 kB CSS — keep texture work in CSS.
- **Verify.** `bun run check` and `bun run build` must stay at 0 errors / 0 warnings. Re-run the Accessibility Ally agent after P1–P2.

## Suggested order

1. P0.1, P0.2 (concrete asks).
2. P1.1 tokens + `.post-it`/`.card` upgrade, P1.2 `NotePanel`.
3. Retrofit authoring panels + cards onto the new system (P1.3).
4. Board/corkboard texture (P1.4).
5. Component polish P2.
6. Typography + motion P3.
7. A11y re-audit + build verification.
