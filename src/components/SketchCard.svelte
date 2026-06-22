<script lang="ts">
    import type { Sketch, Chain } from "../lib/db/schema";
    import {
        boardState,
        updateSketch,
        submitSketch,
        capabilitiesFor,
        trashSketchesFrom
    } from "../lib/state/board.svelte";
    import {
        getStoredImage,
        createObjectUrl,
        revokeObjectUrl
    } from "../lib/db/images";
    import { formatUsd } from "../lib/openrouter/cost";
    import AttachmentChecks from "./AttachmentChecks.svelte";
    import ResolutionControls from "./ResolutionControls.svelte";
    import CardActions from "./CardActions.svelte";
    import Admonition from "./Admonition.svelte";
    import Lightbox from "./Lightbox.svelte";
    import { onDestroy } from "svelte";

    const {
        sketch,
        chain,
        pendingTrashFrom,
        onTrashClick,
        onTrashConfirm,
        onTrashCancel
    }: {
        sketch: Sketch;
        chain: Chain;
        pendingTrashFrom: number | null;
        onTrashClick: (order: number) => void;
        onTrashConfirm: () => void;
        onTrashCancel: () => void;
    } = $props();

    const caps = $derived(capabilitiesFor(chain.modelId));
    const isRoot = $derived(sketch.parentSketchId === null);
    const isRefinement = $derived(!isRoot);
    const isNonConversational = $derived(caps ? !caps.conversational : false);

    const hasStyleDoc = $derived(!!boardState.board?.settings.styleDoc?.trim());
    const hasStyleRef = $derived(!!boardState.board?.settings.styleRefImageId);
    const hasLayoutRef = $derived(
        !!boardState.board?.settings.layoutRefImageId
    );

    // Image display
    let imageUrl = $state<string | null>(null);
    let lightboxOpen = $state(false);

    $effect(() => {
        const firstId = sketch.resultImageIds[0];
        if (!firstId) {
            if (imageUrl) {
                revokeObjectUrl(imageUrl);
                imageUrl = null;
            }
            return;
        }
        getStoredImage(firstId).then((img) => {
            if (imageUrl) revokeObjectUrl(imageUrl);
            imageUrl = img ? createObjectUrl(img.blob) : null;
        });
    });

    onDestroy(() => {
        if (imageUrl) revokeObjectUrl(imageUrl);
    });

    // Pending trash state
    const isPendingTrash = $derived(
        pendingTrashFrom !== null && sketch.order >= pendingTrashFrom
    );

    // Prompt editing (draft cards only)
    let localPrompt = $state("");
    $effect(() => {
        localPrompt = sketch.prompt;
    });

    let debounceTimer: ReturnType<typeof setTimeout>;
    function onPromptInput() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            void updateSketch(sketch.id, { prompt: localPrompt });
        }, 300);
    }

    function generate() {
        void updateSketch(sketch.id, { prompt: localPrompt });
        submitSketch(sketch.id);
    }

    const canGenerate = $derived(
        localPrompt.trim().length > 0 &&
            (sketch.status === "draft" || sketch.status === "error") &&
            !!caps
    );

    // Deterministic note rotation from sketch id (stable, no Math.random)
    function noteRotation(id: string): number {
        let h = 5381;
        for (let i = 0; i < id.length; i++) {
            h = (((h << 5) + h) ^ id.charCodeAt(i)) >>> 0;
        }
        return ((h % 15) - 7) * 0.14; // range ≈ [-0.98, 0.98] deg
    }

    // Convert "16:9" → "16 / 9" for CSS aspect-ratio
    function arCss(ar: string): string {
        return ar.replace(":", " / ");
    }

    const rotation = $derived(noteRotation(sketch.id));
</script>

<article
    class="sketch-card card"
    class:pending-trash={isPendingTrash}
    aria-label="Sketch {sketch.order + 1}: {sketch.prompt.slice(0, 60) ||
        'Draft'}"
    style="--note-rotation: {rotation}deg"
>
    <!-- Status / order header -->
    <div class="card-header" aria-live="polite" aria-atomic="true">
        <span class="order-badge" aria-hidden="true">#{sketch.order + 1}</span>
        {#if sketch.status === "queued"}
            <span class="status-badge status-queued">
                <span class="status-dot" aria-hidden="true"></span>Queued
            </span>
        {:else if sketch.status === "generating"}
            <span class="status-badge status-generating">
                <span class="spinner" aria-hidden="true"></span>Generating…
            </span>
        {:else if sketch.status === "done"}
            <span class="status-badge status-done">
                <span class="status-dot" aria-hidden="true"></span>Done
            </span>
        {:else if sketch.status === "error"}
            <span class="status-badge status-error">
                <span class="status-dot" aria-hidden="true"></span>Error
            </span>
        {/if}
    </div>

    <!-- Non-conversational warning for refinements -->
    {#if isRefinement && isNonConversational}
        <Admonition type="warning">
            Image-only model — this refinement uses image-to-image, not
            conversation history.
        </Admonition>
    {/if}

    <!-- Prompt area — three distinct states -->
    {#if sketch.status === "draft" || sketch.status === "error"}
        <!-- Editable draft -->
        <label for="prompt-{sketch.id}" class="sr-only">
            {isRefinement ? "Refinement prompt" : "Generation prompt"}
        </label>
        <textarea
            id="prompt-{sketch.id}"
            bind:value={localPrompt}
            oninput={onPromptInput}
            rows={3}
            placeholder={isRefinement
                ? "Describe what to change…"
                : "Describe what to generate…"}
            class="prompt-textarea"></textarea>

        <AttachmentChecks
            attach={sketch.attach}
            capabilities={caps}
            {hasStyleDoc}
            {hasStyleRef}
            {hasLayoutRef}
            {isRefinement}
            onChange={(flags) =>
                void updateSketch(sketch.id, { attach: flags })}
        />
        <ResolutionControls
            aspectRatio={sketch.aspectRatio}
            imageSize={sketch.imageSize}
            capabilities={caps}
            onChange={(ar, sz) =>
                void updateSketch(sketch.id, {
                    aspectRatio: ar,
                    imageSize: sz
                })}
        />
        <button
            class="btn-primary generate-btn"
            onclick={generate}
            disabled={!canGenerate}
        >
            {isRefinement ? "Refine" : "Generate"}
        </button>
    {:else if sketch.status === "queued" || sketch.status === "generating"}
        <!-- In-flight: compact clamped prompt + skeleton -->
        <p
            class="prompt-summary"
            title={sketch.prompt}
            aria-label="Prompt: {sketch.prompt}"
        >
            {sketch.prompt}
        </p>
        <div
            class="image-skeleton skeleton"
            style="aspect-ratio: {arCss(sketch.aspectRatio || '1:1')}"
            aria-hidden="true"
        ></div>
    {:else}
        <!-- Done / any other state: expandable caption above image -->
        <details class="prompt-details">
            <summary class="prompt-summary" title={sketch.prompt}>
                {sketch.prompt}
            </summary>
            <p class="prompt-full">{sketch.prompt}</p>
        </details>
    {/if}

    <!-- Result image -->
    {#if imageUrl}
        <div class="result-image">
            <img
                src={imageUrl}
                alt={sketch.prompt.slice(0, 120) || "Generated image"}
                class="result-img"
            />
            <button
                class="zoom-btn"
                onclick={() => (lightboxOpen = true)}
                aria-label="View image full size"
                title="Zoom"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    width="14"
                    height="14"
                    aria-hidden="true"
                >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="16.5" y1="16.5" x2="22" y2="22" />
                </svg>
            </button>
            <!-- Cost receipt chip overlaid -->
            {#if sketch.costActualUsd !== null}
                <span
                    class="cost-chip"
                    aria-label="Cost: {formatUsd(sketch.costActualUsd)}"
                >
                    {formatUsd(sketch.costActualUsd)}
                </span>
            {/if}
        </div>
        <Lightbox
            src={imageUrl}
            alt={sketch.prompt.slice(0, 120) || "Generated image"}
            open={lightboxOpen}
            onClose={() => (lightboxOpen = false)}
        />
    {/if}

    <!-- Error message -->
    {#if sketch.status === "error" && sketch.error}
        <p class="error-msg" role="alert">{sketch.error}</p>
    {/if}

    <!-- In-flight cost estimate (no image yet) -->
    {#if sketch.costEstimateUsd !== null && sketch.status !== "done" && sketch.costActualUsd === null}
        <p class="cost-estimate" title="Estimate — may differ from actual">
            ~{formatUsd(sketch.costEstimateUsd)} est.
        </p>
    {/if}

    <CardActions
        {sketch}
        {chain}
        pendingTrash={isPendingTrash}
        onTrashClick={() => onTrashClick(sketch.order)}
        {onTrashConfirm}
        {onTrashCancel}
    />
</article>

<style>
    .sketch-card {
        width: 280px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .pending-trash {
        background: var(--clr-pending-trash) !important;
        border-color: var(--clr-pending-trash-border) !important;
        opacity: 0.7;
    }

    /* Header */
    .card-header {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }
    .order-badge {
        font-size: 0.6875rem;
        color: var(--clr-text-3);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.03em;
    }

    /* Status badges — dot + label pills */
    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.6875rem;
        font-weight: 700;
        font-family: var(--font-display);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border-radius: 20px;
        padding: 2px 8px 2px 6px;
    }
    .status-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .status-queued {
        background: var(--clr-warning-bg);
        color: var(--clr-warning);
    }
    .status-queued .status-dot {
        background: var(--clr-warning);
    }
    .status-generating {
        background: var(--clr-surface-2);
        color: var(--clr-text-2);
    }
    .status-done {
        background: var(--clr-success-bg);
        color: var(--clr-success);
    }
    .status-done .status-dot {
        background: var(--clr-success);
    }
    .status-error {
        background: var(--clr-danger-bg);
        color: var(--clr-danger);
    }
    .status-error .status-dot {
        background: var(--clr-danger);
    }

    /* Prompt */
    .prompt-textarea {
        width: 100%;
        min-height: 72px;
        font-size: 0.875rem;
    }
    /* One-line clamped summary for in-flight + done caption */
    .prompt-summary {
        font-size: 0.8125rem;
        color: var(--clr-text-2);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .prompt-summary::-webkit-details-marker {
        display: none;
    }
    .prompt-details[open] .prompt-summary {
        white-space: normal;
        overflow: visible;
        text-overflow: unset;
        font-weight: 600;
    }
    .prompt-full {
        font-size: 0.8125rem;
        color: var(--clr-text-2);
        line-height: 1.5;
        margin-top: 4px;
        word-break: break-word;
    }

    /* Image skeleton placeholder */
    .image-skeleton {
        width: 100%;
        min-height: 60px;
        border-radius: 3px;
    }

    /* Result image — photo pinned to note */
    .result-image {
        position: relative;
        border-radius: 3px;
        overflow: hidden;
        border: 3px solid rgba(255, 255, 255, 0.7);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
        margin: 2px 0;
    }
    .result-img {
        width: 100%;
        height: auto;
        display: block;
    }
    /* Cost chip overlaid on image */
    .cost-chip {
        position: absolute;
        bottom: 6px;
        right: 6px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 0.6875rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        padding: 2px 6px;
        border-radius: 10px;
        backdrop-filter: blur(4px);
        pointer-events: none;
    }
    /* Zoom / magnify button overlaid on image */
    .zoom-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 28px;
        height: 28px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        border: 1px solid transparent;
        border-radius: 50%;
        backdrop-filter: blur(4px);
        cursor: pointer;
        transition: background 0.12s;
    }
    .zoom-btn:hover {
        background: rgba(0, 0, 0, 0.75);
    }
    .zoom-btn:focus-visible {
        outline: 2px solid transparent;
        box-shadow: var(--focus-ring);
    }

    .generate-btn {
        width: 100%;
        margin-top: 4px;
    }
    .error-msg {
        font-size: 0.8125rem;
        color: var(--clr-danger);
        background: var(--clr-danger-bg);
        border: 1px solid var(--clr-danger-border);
        border-radius: 4px;
        padding: 6px 8px;
        margin: 0;
    }
    .cost-estimate {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        font-variant-numeric: tabular-nums;
        margin: 0;
    }
</style>
