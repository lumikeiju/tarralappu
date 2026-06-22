<script lang="ts">
    import type { Sketch, Chain } from "../lib/db/schema";
    import { elidedRequestJson } from "../lib/openrouter/compose";
    import { retrySketch, forkChain } from "../lib/state/board.svelte";

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

    function handleFork() {
        void forkChain(chain.id, sketch.order);
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

    <!-- Fork / Refresh (done only) -->
    {#if sketch.status === "done"}
        <button
            class="btn-icon"
            onclick={handleFork}
            aria-label="Fork this chain from here"
            title="Fork"
        >
            ↺
        </button>
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
