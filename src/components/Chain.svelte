<script lang="ts">
    import type { Chain } from "../lib/db/schema";
    import {
        sketchesForChain,
        chainCostTotal,
        createRefinementSketch,
        trashSketchesFrom,
        updateChain,
        boardState
    } from "../lib/state/board.svelte";
    import { capabilitiesFor } from "../lib/state/board.svelte";
    import { formatUsd } from "../lib/openrouter/cost";
    import SketchCard from "./SketchCard.svelte";

    const { chain }: { chain: Chain } = $props();

    const sketches = $derived(sketchesForChain(chain.id));
    const chainTotal = $derived(chainCostTotal(chain.id));
    const caps = $derived(capabilitiesFor(chain.modelId));
    const lastSketch = $derived(sketches[sketches.length - 1]);
    const canRefine = $derived(lastSketch?.status === "done");

    // Trash state: which order index triggered the pending-trash
    let pendingTrashFrom = $state<number | null>(null);

    function onTrashClick(order: number) {
        pendingTrashFrom = order;
    }
    function onTrashCancel() {
        pendingTrashFrom = null;
    }
    async function onTrashConfirm() {
        if (pendingTrashFrom === null) return;
        const from = pendingTrashFrom;
        pendingTrashFrom = null;
        await trashSketchesFrom(chain.id, from);
    }

    async function addRefinement() {
        if (!lastSketch) return;
        await createRefinementSketch(lastSketch.id);
    }

    let capInput = $state("");
    $effect(() => {
        capInput = chain.chainCostCapUsd?.toString() ?? "";
    });

    function onCapChange() {
        const val = parseFloat(capInput);
        const cap = isNaN(val) || val <= 0 ? null : val;
        void updateChain(chain.id, { chainCostCapUsd: cap });
    }
</script>

<div class="chain-row">
    <!-- Chain header — label-tape strip -->
    <header class="chain-header">
        <div class="chain-meta">
            <span class="model-badge" title={chain.modelId}>
                {boardState.availableModels.find((m) => m.id === chain.modelId)
                    ?.name ?? chain.modelId}
            </span>
            {#if chain.forkedFrom}
                <span class="fork-badge" title="Forked chain"
                    >⑂ {chain.forkedFrom.kind === "refinement"
                        ? "Refinement fork"
                        : "Re-run fork"}</span
                >
            {/if}
        </div>
        <div class="chain-cost">
            <span class="chain-cost-total">{formatUsd(chainTotal)}</span>
            {#if chain.chainCostCapUsd !== null}
                <span class="chain-cost-cap"
                    >/ {formatUsd(chain.chainCostCapUsd)}</span
                >
            {/if}
            <label class="cap-label" title="Set chain cost cap">
                <span class="sr-only">Chain cost cap ($)</span>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cap $"
                    bind:value={capInput}
                    onblur={onCapChange}
                    class="cap-input"
                    aria-label="Chain cost cap in USD"
                />
            </label>
        </div>
    </header>

    <!-- Cards row with decorative connector -->
    <div class="cards-row" role="list" aria-label="Sketch chain">
        {#each sketches as sketch, i (sketch.id)}
            {#if i > 0}
                <div class="card-connector" aria-hidden="true">
                    <svg width="24" height="2" aria-hidden="true"
                        ><line
                            x1="0"
                            y1="1"
                            x2="24"
                            y2="1"
                            stroke="var(--clr-border)"
                            stroke-width="1.5"
                            stroke-dasharray="4 3"
                        /></svg
                    >
                </div>
            {/if}
            <div role="listitem">
                <SketchCard
                    {sketch}
                    {chain}
                    {pendingTrashFrom}
                    {onTrashClick}
                    {onTrashConfirm}
                    {onTrashCancel}
                />
            </div>
        {/each}

        <!-- Ghost "+ Refine" card -->
        {#if canRefine && !sketches.some((s) => s.status === "draft")}
            <div class="card-connector" aria-hidden="true">
                <svg width="24" height="2" aria-hidden="true"
                    ><line
                        x1="0"
                        y1="1"
                        x2="24"
                        y2="1"
                        stroke="var(--clr-border)"
                        stroke-width="1.5"
                        stroke-dasharray="4 3"
                    /></svg
                >
            </div>
            <div class="ghost-card-wrap">
                <button
                    class="ghost-refine-card"
                    onclick={addRefinement}
                    aria-label="Add refinement sketch"
                >
                    <span class="ghost-plus" aria-hidden="true">+</span>
                    <span class="ghost-label">Refine</span>
                </button>
            </div>
        {/if}
    </div>
</div>

<style>
    .chain-row {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--clr-border-2);
    }
    .chain-header {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 0 4px;
    }
    .chain-meta {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    /* Label-tape look for model name */
    .model-badge {
        font-size: 0.6875rem;
        font-weight: 700;
        font-family: var(--font-display);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: var(--tape-bg);
        color: var(--clr-text);
        border: none;
        border-radius: 3px;
        padding: 3px 10px;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
    .fork-badge {
        font-size: 0.75rem;
        color: var(--clr-text-3);
    }
    .chain-cost {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        font-variant-numeric: tabular-nums;
        margin-left: auto;
    }
    .chain-cost-total {
        font-weight: 600;
        color: var(--clr-text);
    }
    .chain-cost-cap {
        color: var(--clr-text-3);
    }
    .cap-input {
        width: 72px;
        padding: 2px 6px;
        font-size: 0.75rem;
        text-align: right;
    }
    /* Cards row */
    .cards-row {
        display: flex;
        flex-direction: row;
        gap: 0;
        overflow-x: auto;
        padding-bottom: 8px;
        padding-top: 16px; /* room for tape accents */
        align-items: flex-start;
    }
    /* Connector between cards */
    .card-connector {
        display: flex;
        align-items: center;
        padding-top: 48px; /* align with card midpoint */
        flex-shrink: 0;
    }
    /* Ghost "+ Refine" placeholder card */
    .ghost-card-wrap {
        flex-shrink: 0;
        padding-top: 16px;
    }
    .ghost-refine-card {
        width: 140px;
        min-height: 80px;
        border: 2px dashed var(--clr-border);
        border-radius: var(--card-radius);
        background: transparent;
        color: var(--clr-text-3);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
        transition:
            border-color 0.15s,
            color 0.15s,
            background 0.15s;
        padding: var(--sp-3);
    }
    .ghost-refine-card:hover {
        border-color: var(--clr-accent);
        color: var(--clr-accent);
        background: rgba(0, 87, 168, 0.04);
    }
    .ghost-plus {
        font-size: 1.5rem;
        line-height: 1;
        font-weight: 300;
    }
    .ghost-label {
        font-size: 0.75rem;
        font-weight: 600;
        font-family: var(--font-display);
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
</style>
