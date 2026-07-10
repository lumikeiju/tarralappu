<script lang="ts">
    import type { Sketch, Chain } from "../lib/db/schema";
    import { elidedRequestJson } from "../lib/openrouter/compose";
    import {
        retrySketch,
        forkReroll,
        forkRefinementDrafts
    } from "../lib/state/board.svelte";

    const {
        sketch,
        chain,
        pendingTrash,
        onTrashClick,
        onTrashConfirm,
        onTrashCancel
    }: {
        sketch: Sketch;
        chain: Chain;
        pendingTrash: boolean;
        onTrashClick: () => void;
        onTrashConfirm: () => void;
        onTrashCancel: () => void;
    } = $props();

    let showSource = $state(false);

    const sourceJson = $derived(
        sketch.requestSnapshot
            ? elidedRequestJson(sketch.requestSnapshot)
            : null
    );

    async function copySource() {
        if (!sourceJson) return;
        await navigator.clipboard.writeText(sourceJson);
    }

    let forkCount = $state<"1" | "2" | "3" | "4">("1");
    let forksCreating = $state(false);
    let forkStatus = $state("");
    let forkError = $state("");

    const canForkRefinements = $derived(
        sketch.status === "done" ||
            ((sketch.status === "draft" || sketch.status === "error") &&
                sketch.parentSketchId !== null)
    );

    async function handleReroll() {
        forksCreating = true;
        forkStatus = "Creating re-run forks…";
        forkError = "";
        try {
            await forkReroll(sketch.id, Number(forkCount) as 1 | 2 | 3 | 4);
            forkStatus = `Created ${forkCount} re-run ${forkCount === "1" ? "fork" : "forks"}.`;
        } catch (error) {
            forkError =
                error instanceof Error
                    ? error.message
                    : "Could not create the re-run fork.";
        } finally {
            forksCreating = false;
        }
    }

    async function handleRefinementForks() {
        forksCreating = true;
        forkStatus = "Creating refinement forks…";
        forkError = "";
        try {
            await forkRefinementDrafts(
                sketch.id,
                Number(forkCount) as 1 | 2 | 3 | 4
            );
            forkStatus = `Created ${forkCount} refinement ${forkCount === "1" ? "fork" : "forks"}.`;
        } catch (error) {
            forkStatus = "";
            forkError =
                error instanceof Error
                    ? error.message
                    : "Could not create refinement forks.";
        } finally {
            forksCreating = false;
        }
    }
</script>

<div class="card-actions">
    <!-- View source -->
    {#if sketch.requestSnapshot || sketch.status === "done"}
        <button
            class="btn-icon"
            onclick={() => (showSource = !showSource)}
            aria-expanded={showSource}
            aria-label="View request source"
            title="View source"
        >
            &lt;/&gt;
        </button>
    {/if}

    <!-- Retry (error only) -->
    {#if sketch.status === "error"}
        <button
            class="btn-ghost retry-btn"
            onclick={() => retrySketch(sketch.id)}
            title="Retry"
        >
            Retry
        </button>
    {/if}

    <!-- A completed parent, or an unfinished refinement of one, can branch. -->
    {#if canForkRefinements}
        <span class="fork-controls">
            <label class="sr-only" for="fork-count-{sketch.id}"
                >Number of refinement forks</label
            >
            <select
                class="fork-count"
                id="fork-count-{sketch.id}"
                bind:value={forkCount}
                disabled={forksCreating}
            >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
            </select>
            <span aria-hidden="true">×</span>
            {#if sketch.status === "done"}
                <button
                    class="btn-icon action-btn"
                    onclick={handleReroll}
                    disabled={forksCreating}
                    aria-label="Create {forkCount} re-run {forkCount === '1'
                        ? 'fork'
                        : 'forks'}"
                    title="Create {forkCount} re-run {forkCount === '1'
                        ? 'fork'
                        : 'forks'} with this prompt ready to run again"
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 11a8 8 0 0 0-14.9-4" />
                        <path d="M4 5v5h5" />
                        <path d="M4 13a8 8 0 0 0 14.9 4" />
                        <path d="M20 19v-5h-5" />
                    </svg>
                </button>
            {/if}
            <button
                class="btn-icon action-btn"
                onclick={handleRefinementForks}
                disabled={forksCreating}
                aria-label="Create {forkCount} refinement {forkCount === '1'
                    ? 'fork'
                    : 'forks'}"
                title="Create {forkCount} new rows with copied refinement prompts and settings"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="5" cy="5" r="2" />
                    <circle cx="5" cy="19" r="2" />
                    <circle cx="19" cy="12" r="2" />
                    <path d="M7 5h3a4 4 0 0 1 4 4v1" />
                    <path d="M7 19h3a4 4 0 0 0 4-4v-1" />
                    <path d="M14 12h3" />
                </svg>
            </button>
        </span>
    {/if}

    <!-- Trash -->
    {#if !pendingTrash}
        <button
            class="btn-icon trash-btn"
            onclick={onTrashClick}
            aria-label="Trash this card and descendants"
            title="Trash"
        >
            🗑
        </button>
    {:else}
        <span class="trash-confirm-row">
            <button class="btn-danger confirm-btn" onclick={onTrashConfirm}
                >Delete</button
            >
            <button class="btn-ghost" onclick={onTrashCancel}>Cancel</button>
        </span>
    {/if}
</div>

{#if forkStatus}
    <p class="sr-only" role="status">{forkStatus}</p>
{/if}
{#if forkError}
    <p class="fork-error" role="alert">{forkError}</p>
{/if}

{#if showSource && sourceJson}
    <div class="source-panel" role="region" aria-label="Request source">
        <div class="source-header">
            <span>Request (image data elided, key redacted)</span>
            <button class="btn-ghost copy-btn" onclick={copySource}>Copy</button
            >
            <button
                class="btn-icon"
                onclick={() => (showSource = false)}
                aria-label="Close">✕</button
            >
        </div>
        <pre class="source-pre"><code>{sourceJson}</code></pre>
    </div>
{/if}

<style>
    .card-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
    }
    .trash-btn {
        color: var(--clr-danger);
    }
    .trash-confirm-row {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .confirm-btn {
        font-size: 0.75rem;
        padding: 2px 8px;
    }
    .retry-btn {
        font-size: 0.75rem;
        padding: 2px 8px;
    }
    .action-btn,
    .fork-controls select {
        font-size: 0.75rem;
        padding: 2px 6px;
    }
    .action-btn svg {
        display: block;
        width: 1rem;
        height: 1rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }
    .fork-count {
        width: auto;
        border-color: var(--clr-text-2);
    }
    .fork-controls {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    .fork-error {
        margin-top: 4px;
        font-size: 0.75rem;
        color: var(--clr-danger);
    }
    .source-panel {
        margin-top: 8px;
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
    }
    .copy-btn {
        font-size: 0.75rem;
        padding: 1px 6px;
    }
    .source-pre {
        margin: 0;
        padding: 10px 12px;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        color: var(--clr-text);
        overflow-x: auto;
        max-height: 320px;
        overflow-y: auto;
        white-space: pre;
    }
</style>
