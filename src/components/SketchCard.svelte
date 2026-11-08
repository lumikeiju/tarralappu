<script lang="ts">
    import type { Sketch, Chain } from "../lib/db/schema";
    import {
        boardState,
        streamingPreviews,
        updateSketch,
        submitSketch,
        capabilitiesFor,
        loadImageEndpoints,
        generateRandomSketchPrompt,
        getSessionBudgetUsed,
        randomTextGeneration
    } from "../lib/state/board.svelte";
    import { auth } from "../lib/state/settings.svelte";
    import { humanizeError, rawErrorDetails } from "../lib/openrouter/client";
    import { formatUsd, estimateCost } from "../lib/openrouter/cost";
    import {
        effectiveOption,
        isGptImage26
    } from "../lib/openrouter/capabilities";
    import { effectiveInputImages } from "../lib/openrouter/options";
    import AttachmentChecks from "./AttachmentChecks.svelte";
    import ResolutionControls from "./ResolutionControls.svelte";
    import CardActions from "./CardActions.svelte";
    import Admonition from "./Admonition.svelte";
    import Lightbox from "./Lightbox.svelte";
    import MediaPreview from "./MediaPreview.svelte";
    import ImageAdvancedControls from "./ImageAdvancedControls.svelte";
    import SketchReferences from "./SketchReferences.svelte";
    import { onDestroy, tick, untrack } from "svelte";

    const {
        sketch,
        chain,
        pendingTrashFrom,
        pendingTrashCount,
        onTrashClick,
        onTrashConfirm,
        onTrashCancel
    }: {
        sketch: Sketch;
        chain: Chain;
        pendingTrashFrom: number | null;
        pendingTrashCount: number;
        onTrashClick: (order: number) => void;
        onTrashConfirm: () => void;
        onTrashCancel: () => void;
    } = $props();

    const caps = $derived(capabilitiesFor(chain.modelId));
    const isRoot = $derived(sketch.parentSketchId === null);
    const isRefinement = $derived(!isRoot);
    const parentImageIds = $derived(
        boardState.sketches.find((s) => s.id === sketch.parentSketchId)
            ?.resultImageIds ?? []
    );
    const inputSelection = $derived.by(() => {
        try {
            return {
                count: effectiveInputImages(sketch, parentImageIds).length,
                error: ""
            };
        } catch (cause) {
            return {
                count: 0,
                error: cause instanceof Error ? cause.message : String(cause)
            };
        }
    });
    const parentImageCount = $derived(inputSelection.count);
    const isNonConversational = $derived(caps ? !caps.conversational : false);

    const hasStyleDoc = $derived(!!boardState.board?.settings.styleDoc?.trim());
    const hasStyleRef = $derived(!!boardState.board?.settings.styleRefImageId);
    const hasLayoutRef = $derived(
        !!boardState.board?.settings.layoutRefImageId
    );

    // Image display
    let lightboxIndex = $state(0);
    let lightboxOpen = $state(false);
    let showErrorRaw = $state(false);
    let copyStatus = $state("");
    let generateError = $state("");
    const inputCount = $derived(
        parentImageCount +
            (sketch.attach.styleRef && hasStyleRef ? 1 : 0) +
            (sketch.attach.layoutRef && hasLayoutRef ? 1 : 0)
    );
    const unknownEstimate = $derived(
        caps
            ? estimateCost(caps, inputCount, sketch.outputCount ?? 1) === null
            : true
    );
    const hasCostCap = $derived(
        chain.chainCostCapUsd !== null ||
            boardState.board?.settings.sessionCostCapUsd != null
    );
    $effect(() => {
        if (caps && isGptImage26(chain.modelId))
            untrack(() => void loadImageEndpoints(chain.modelId));
    });

    $effect(() => {
        if (sketch.status !== "error") showErrorRaw = false;
    });

    async function copyErrorRaw() {
        if (!sketch.errorRaw) return;
        try {
            await navigator.clipboard.writeText(sketch.errorRaw);
            copyStatus = "Raw response copied.";
        } catch {
            copyStatus = "Could not copy the raw response.";
        }
    }

    function imageDimensions(aspectRatio: string): {
        width: number;
        height: number;
    } {
        const [width, height] = aspectRatio.split(":").map(Number);
        if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            height <= 0
        ) {
            return { width: 1024, height: 1024 };
        }
        return { width: 1024, height: Math.round((1024 * height) / width) };
    }

    // The ratio actually sent: stored values the model doesn't support fall back
    // to its first allowed option in composeRequest.
    const displayAspectRatio = $derived(
        (caps
            ? effectiveOption(sketch.aspectRatio, caps.aspectRatios)
            : sketch.aspectRatio) || "1:1"
    );
    const intrinsicSize = $derived(imageDimensions(displayAspectRatio));

    // Pending trash state
    const isPendingTrash = $derived(
        pendingTrashFrom !== null && sketch.order >= pendingTrashFrom
    );

    // Prompt editing (draft cards only)
    let localPrompt = $state("");
    let randomizing = $state(false);
    let randomStatus = $state("");
    let randomError = $state("");
    let randomErrorRaw = $state<string | null>(null);
    let randomBudgetAcknowledged = $state(false);
    let randomButton = $state<HTMLButtonElement>();
    let cancelRandomButton = $state<HTMLButtonElement>();
    let randomBudgetCheckbox = $state<HTMLInputElement>();
    let randomController: AbortController | undefined;
    let destroyed = false;
    const sessionCap = $derived(
        boardState.board?.settings.sessionCostCapUsd ?? null
    );
    const randomCapReached = $derived(
        sessionCap !== null && getSessionBudgetUsed() >= sessionCap
    );
    $effect(() => {
        localPrompt = sketch.prompt;
    });

    let debounceTimer: ReturnType<typeof setTimeout>;
    function onPromptInput() {
        randomStatus = "";
        randomError = "";
        randomErrorRaw = null;
        generateError = "";
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            void flushPrompt().catch((cause: unknown) => {
                generateError = humanizeError(cause);
            });
        }, 300);
    }

    async function flushPrompt() {
        clearTimeout(debounceTimer);
        await updateSketch(sketch.id, { prompt: localPrompt });
    }

    async function randomizePrompt() {
        if (randomizing || randomTextGeneration.inProgress) return;
        randomStatus = "";
        randomError = "";
        randomErrorRaw = null;
        generateError = "";
        randomizing = true;
        randomController = new AbortController();
        clearTimeout(debounceTimer);
        await tick();
        cancelRandomButton?.focus();
        try {
            await flushPrompt();
            const result = await generateRandomSketchPrompt(sketch.id, {
                signal: randomController.signal,
                budgetAcknowledged: randomBudgetAcknowledged
            });
            randomStatus =
                result.costUsd === null
                    ? "Random prompt saved. Cost unavailable; the session total may be incomplete."
                    : `Random prompt saved. Text-generation cost: ${formatUsd(result.costUsd)}.`;
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") {
                randomStatus =
                    "Random generation cancelled. Your prompt is unchanged. OpenRouter may still charge for processed tokens.";
            } else {
                randomError = humanizeError(cause);
                randomErrorRaw = rawErrorDetails(cause);
            }
        } finally {
            const restoreFocus =
                !destroyed && document.activeElement === cancelRandomButton;
            randomizing = false;
            randomBudgetAcknowledged = false;
            randomController = undefined;
            if (restoreFocus) {
                await tick();
                if (randomButton && !randomButton.disabled) {
                    randomButton.focus();
                } else if (
                    randomBudgetCheckbox &&
                    !randomBudgetCheckbox.disabled
                ) {
                    randomBudgetCheckbox.focus();
                } else {
                    document.getElementById(`prompt-${sketch.id}`)?.focus();
                }
            }
        }
    }

    async function generate() {
        if (randomizing) return;
        generateError = "";
        try {
            await flushPrompt();
            submitSketch(sketch.id);
        } catch (cause) {
            generateError =
                cause instanceof Error ? cause.message : String(cause);
        }
    }
    onDestroy(() => {
        destroyed = true;
        clearTimeout(debounceTimer);
        randomController?.abort();
    });

    const canGenerate = $derived(
        localPrompt.trim().length > 0 &&
            !randomizing &&
            (sketch.status === "draft" || sketch.status === "error") &&
            !!caps &&
            !inputSelection.error &&
            (!isGptImage26(chain.modelId) ||
                (!!caps.advanced.endpoint &&
                    !caps.advanced.pending &&
                    !caps.advanced.error)) &&
            (!unknownEstimate || !hasCostCap || !!sketch.budgetAcknowledged)
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
    <div class="card-header">
        <div
            class="card-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            <span class="order-badge" aria-hidden="true"
                >#{sketch.order + 1}</span
            >
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
        {#if isPendingTrash}
            <span class="status-badge pending-trash-badge">Will be deleted</span
            >
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
        <div class="prompt-actions">
            <label for="prompt-{sketch.id}">
                {isRefinement ? "Refinement prompt" : "Generation prompt"}
            </label>
            <button
                bind:this={randomButton}
                class="btn-ghost prompt-random-btn"
                type="button"
                onclick={randomizePrompt}
                aria-label="Random prompt for this sketch"
                aria-describedby="sketch-random-hint-{sketch.id}"
                title="Replace this prompt using DeepSeek Flash via OpenRouter (uses API credits)"
                disabled={randomizing ||
                    randomTextGeneration.inProgress ||
                    !auth.apiKey ||
                    isPendingTrash ||
                    randomCapReached ||
                    (sessionCap !== null && !randomBudgetAcknowledged)}
                >Random</button
            >
            {#if randomizing}
                <button
                    bind:this={cancelRandomButton}
                    class="btn-ghost prompt-random-btn"
                    type="button"
                    onclick={() => randomController?.abort()}
                    aria-label="Cancel random sketch prompt generation"
                    >Cancel</button
                >
            {/if}
        </div>
        <textarea
            id="prompt-{sketch.id}"
            bind:value={localPrompt}
            oninput={onPromptInput}
            rows={3}
            disabled={randomizing}
            placeholder={isRefinement
                ? "Describe what to change…"
                : "Describe what to generate…"}
            class="prompt-textarea"></textarea>
        <details class="prompt-random-hint">
            <summary id="sketch-random-hint-{sketch.id}">
                Random uses API credits
            </summary>
            <p>
                Replaces this prompt using DeepSeek Flash via OpenRouter, not
                the row's image model. Existing prompts and reference images are
                not sent.
            </p>
        </details>
        {#if !auth.apiKey}
            <p class="prompt-random-hint">Connect an API key to use Random.</p>
        {:else if randomCapReached}
            <p class="prompt-random-hint">The session cost cap is reached.</p>
        {:else if randomTextGeneration.inProgress && !randomizing}
            <p class="prompt-random-hint">Another Random request is running.</p>
        {/if}
        {#if sessionCap !== null && !randomCapReached}
            <label class="random-budget-acknowledgment">
                <input
                    bind:this={randomBudgetCheckbox}
                    type="checkbox"
                    bind:checked={randomBudgetAcknowledged}
                    disabled={randomizing || randomTextGeneration.inProgress}
                />
                I understand Random cannot be pre-estimated and may exceed this local
                cap.
            </label>
        {/if}
        {#if randomizing}
            <p class="prompt-random-hint" role="status">
                Generating a random prompt...
            </p>
        {/if}
        {#if randomStatus}
            <p class="prompt-random-hint" role="status">{randomStatus}</p>
        {/if}
        {#if randomError}<p class="error-msg" role="alert">
                {randomError}
            </p>{/if}
        {#if randomErrorRaw}
            <details class="source-panel">
                <summary>Raw Random API response</summary>
                <pre class="source-pre">{randomErrorRaw}</pre>
            </details>
        {/if}

        <SketchReferences {sketch} capabilities={caps} {parentImageIds} />
        {#if inputSelection.error}<p class="error-msg" role="alert">
                {inputSelection.error}
            </p>{/if}
        <AttachmentChecks
            attach={sketch.attach}
            capabilities={caps}
            {hasStyleDoc}
            {hasStyleRef}
            {hasLayoutRef}
            {isRefinement}
            {parentImageCount}
            onChange={(flags) =>
                void updateSketch(sketch.id, { attach: flags })}
        />
        <ImageAdvancedControls
            {sketch}
            capabilities={caps}
            {hasCostCap}
            {unknownEstimate}
            onChange={(updates) => updateSketch(sketch.id, updates)}
        />
        <ResolutionControls
            aspectRatio={sketch.aspectRatio}
            imageSize={sketch.imageSize}
            quality={sketch.quality}
            background={sketch.background}
            reasoningEffort={sketch.reasoningEffort}
            streamEnabled={sketch.streamEnabled}
            outputCount={sketch.outputCount ?? 1}
            outputFormat={sketch.outputFormat ?? null}
            outputCompression={sketch.outputCompression ?? null}
            seed={sketch.seed ?? null}
            capabilities={caps}
            onChange={(updates) => void updateSketch(sketch.id, updates)}
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
            style="aspect-ratio: {arCss(displayAspectRatio)}"
            aria-hidden="true"
        >
            {#if streamingPreviews[sketch.id]?.length}
                <img
                    src={streamingPreviews[sketch.id].at(-1)}
                    alt=""
                    width={intrinsicSize.width}
                    height={intrinsicSize.height}
                    class="stream-preview-img"
                />
            {/if}
        </div>
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
    {#if sketch.resultImageIds.length > 0}
        <div
            class="result-gallery"
            class:single={sketch.resultImageIds.length === 1}
            aria-label="Generated images"
        >
            {#each sketch.resultImageIds as imageId, index (imageId)}
                <div class="result-image">
                    <MediaPreview
                        {imageId}
                        alt={sketch.resultImageIds.length > 1
                            ? `${sketch.prompt.slice(0, 100) || "Generated image"} (output ${index + 1} of ${sketch.resultImageIds.length})`
                            : sketch.prompt.slice(0, 120) || "Generated image"}
                    />
                    <button
                        class="zoom-btn"
                        onclick={() => {
                            lightboxIndex = index;
                            lightboxOpen = true;
                        }}
                        aria-label="View generated image {index + 1} full size"
                        title="View full size"
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
                    {#if index === 0 && sketch.costActualUsd !== null}
                        <span
                            class="cost-chip"
                            aria-label="Cost: {formatUsd(sketch.costActualUsd)}"
                        >
                            {formatUsd(sketch.costActualUsd)}
                        </span>
                    {/if}
                </div>
            {/each}
        </div>
        <Lightbox
            imageId={sketch.resultImageIds[lightboxIndex] ??
                sketch.resultImageIds[0]!}
            alt={sketch.resultImageIds.length > 1
                ? `${sketch.prompt.slice(0, 100) || "Generated image"} (output ${lightboxIndex + 1} of ${sketch.resultImageIds.length})`
                : sketch.prompt.slice(0, 120) || "Generated image"}
            open={lightboxOpen}
            onClose={() => (lightboxOpen = false)}
        />
        <p class="cost-estimate">
            {sketch.resultImageIds.length} output{sketch.resultImageIds
                .length === 1
                ? ""
                : "s"} received.
        </p>
        {#if sketch.resultMetadata?.quality || sketch.resultMetadata?.background}
            <p class="cost-estimate">
                Provider settings: {sketch.resultMetadata.quality ??
                    "quality not reported"}; {sketch.resultMetadata
                    .background ?? "background not reported"}.
            </p>
        {/if}
    {/if}
    {#if sketch.resultWarning}<Admonition type="warning"
            >{sketch.resultWarning}</Admonition
        >{/if}
    {#if sketch.costUnreported}
        <Admonition type="warning">
            At least one generation attempt may have unreported charges. Totals
            include only known amounts; check OpenRouter for the full cost.
        </Admonition>
    {/if}
    {#if generateError}<p class="error-msg" role="alert">
            {generateError}
        </p>{/if}

    <!-- Error message -->
    {#if sketch.status === "error" && sketch.error}
        <p class="error-msg" role="alert">{sketch.error}</p>
        {#if sketch.costActualUsd !== null}
            <p class="cost-estimate">
                Known charges: {formatUsd(sketch.costActualUsd)}.
            </p>
        {/if}
        {#if sketch.errorRaw}
            <button
                class="btn-ghost raw-toggle-btn"
                onclick={() => (showErrorRaw = !showErrorRaw)}
                aria-expanded={showErrorRaw}
            >
                {showErrorRaw ? "Hide raw response" : "View raw response"}
            </button>
            {#if showErrorRaw}
                <div
                    class="source-panel"
                    role="region"
                    aria-label="Raw error response"
                >
                    <div class="source-header">
                        <span>Raw error response</span>
                        <button
                            class="btn-ghost copy-btn"
                            onclick={copyErrorRaw}>Copy</button
                        >
                    </div>
                    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                    <pre class="source-pre" tabindex="0"><code
                            >{sketch.errorRaw}</code
                        ></pre>
                </div>
                <p class="sr-only" role="status" aria-live="polite">
                    {copyStatus}
                </p>
            {/if}
        {/if}
    {/if}

    <!-- In-flight cost estimate (no image yet) -->
    {#if sketch.costEstimateUsd !== null && sketch.status !== "done" && sketch.costActualUsd === null}
        <p
            class="cost-estimate"
            title="Lower-bound estimate — actual cost may be higher"
        >
            ~{formatUsd(sketch.costEstimateUsd)} est.
        </p>
    {/if}

    <CardActions
        {sketch}
        {chain}
        busy={randomizing}
        pendingTrash={isPendingTrash}
        {pendingTrashCount}
        onTrashClick={() => onTrashClick(sketch.order)}
        {onTrashConfirm}
        {onTrashCancel}
    />
</article>

<style>
    .sketch-card {
        width: 280px;
        min-width: 0;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .sketch-card > * {
        min-width: 0;
        max-width: 100%;
    }
    .pending-trash {
        background: var(--clr-pending-trash) !important;
        border-color: var(--clr-pending-trash-border) !important;
    }
    .pending-trash-badge {
        margin-left: auto;
        padding: 1px 7px;
        border: 1px solid var(--clr-danger);
        color: var(--clr-danger);
    }

    /* Header */
    .card-header,
    .card-status {
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
    .prompt-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        font-size: 0.8125rem;
    }
    .prompt-actions label {
        flex: 1;
        font-weight: 600;
    }
    .prompt-random-btn {
        min-height: 24px;
        padding: 2px 6px;
        font-size: 0.75rem;
    }
    .prompt-random-btn:focus-visible,
    .random-budget-acknowledgment input:focus-visible,
    .prompt-random-hint summary:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
        box-shadow: none;
    }
    .prompt-random-hint {
        font-size: 0.75rem;
        color: var(--clr-text);
        overflow-wrap: anywhere;
    }
    .random-budget-acknowledgment {
        display: flex;
        align-items: start;
        gap: 6px;
        font-size: 0.75rem;
    }
    .random-budget-acknowledgment input {
        width: auto;
        flex-shrink: 0;
    }
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
        position: relative;
        width: 100%;
        min-height: 60px;
        border-radius: 3px;
        overflow: hidden;
    }
    /* Live partial-image preview while a streamed generation is in flight */
    .stream-preview-img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.85;
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
    .result-gallery {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
    }
    .result-gallery.single {
        grid-template-columns: minmax(0, 1fr);
    }
    /* Cost chip overlaid on image */
    .cost-chip {
        display: inline-block;
        margin: 4px;
        background: rgba(0, 0, 0, 0.55);
        color: var(--clr-on-overlay);
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
        color: var(--clr-on-overlay);
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
        min-width: 0;
        max-width: 100%;
        font-size: 0.8125rem;
        color: var(--clr-danger);
        background: var(--clr-danger-bg);
        border: 1px solid var(--clr-danger-border);
        border-radius: 4px;
        padding: 6px 8px;
        margin: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
    }
    .raw-toggle-btn {
        align-self: flex-start;
        font-size: 0.75rem;
        padding: 2px 6px;
    }
    .source-panel {
        min-width: 0;
        max-width: 100%;
        background: var(--clr-surface-2);
        border: 1px solid var(--clr-border);
        border-radius: 4px;
        overflow: hidden;
    }
    .source-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--clr-bg);
        border-bottom: 1px solid var(--clr-border);
        font-size: 0.75rem;
        color: var(--clr-text-2);
    }
    .source-header span {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .copy-btn {
        font-size: 0.75rem;
        padding: 1px 6px;
    }
    .source-pre {
        min-width: 0;
        max-width: 100%;
        margin: 0;
        padding: 10px 12px;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        color: var(--clr-text);
        overflow-x: hidden;
        max-height: 320px;
        overflow-y: auto;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
    }
    .cost-estimate {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        font-variant-numeric: tabular-nums;
        margin: 0;
    }
</style>
