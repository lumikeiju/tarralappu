<script lang="ts">
    import { tick } from "svelte";
    import { getChainsOrdered } from "../lib/state/board.svelte";
    import Chain from "./Chain.svelte";
    import NewChainComposer from "./NewChainComposer.svelte";

    let showComposer = $state(false);
    let newSketchBtn = $state<HTMLButtonElement>();
    const chainsOrdered = $derived(getChainsOrdered());

    async function closeComposer(createdSketchId?: string) {
        showComposer = false;
        await tick();
        const draftPrompt = createdSketchId
            ? document.getElementById(`prompt-${createdSketchId}`)
            : null;
        (draftPrompt ?? newSketchBtn)?.focus();
    }
</script>

<section class="board" aria-label="Sketch board">
    {#if chainsOrdered.length === 0 && !showComposer}
        <div class="empty-state">
            <div class="empty-note" aria-hidden="true">
                <span class="empty-pin">📌</span>
            </div>
            <p class="empty-headline">No sketches yet</p>
            <p class="empty-hint">Pin your first note to start generating.</p>
        </div>
    {/if}

    {#each chainsOrdered as chain (chain.id)}
        <Chain {chain} onRemoved={() => newSketchBtn?.focus()} />
    {/each}

    {#if showComposer}
        <NewChainComposer onClose={closeComposer} />
    {:else}
        <button
            class="new-sketch-btn"
            bind:this={newSketchBtn}
            onclick={() => (showComposer = true)}
            aria-label="Create a new sketch"
        >
            <span class="new-sketch-plus" aria-hidden="true">+</span>
            <span>New Sketch</span>
        </button>
    {/if}
</section>

<style>
    .board {
        display: flex;
        flex-direction: column;
        gap: 28px;
        padding: 24px 20px;
        flex: 1;
    }
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 48px 24px;
        color: var(--clr-text-3);
    }
    .empty-note {
        font-size: 2.5rem;
        line-height: 1;
        margin-bottom: 4px;
    }
    .empty-pin {
        display: inline-block;
        transform: rotate(-15deg);
    }
    .empty-headline {
        font-size: 1rem;
        font-weight: 700;
        font-family: var(--font-display);
        color: var(--clr-text-2);
    }
    .empty-hint {
        font-size: 0.875rem;
        color: var(--clr-text-3);
    }
    /* Ghost card style for the "New Sketch" button */
    .new-sketch-btn {
        align-self: flex-start;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
        font-weight: 700;
        font-family: var(--font-display);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 12px 20px;
        border: 2px dashed var(--clr-border);
        border-radius: var(--card-radius);
        background: transparent;
        color: var(--clr-text-3);
        cursor: pointer;
        transition:
            border-color 0.15s,
            color 0.15s,
            background 0.15s;
        margin-top: 4px;
    }
    .new-sketch-btn:hover {
        border-color: var(--clr-accent);
        color: var(--clr-accent);
        background: color-mix(in srgb, var(--clr-accent) 4%, transparent);
    }
    .new-sketch-plus {
        font-size: 1.25rem;
        font-weight: 300;
        line-height: 1;
    }
</style>
