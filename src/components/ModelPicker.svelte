<script lang="ts">
    import {
        boardState,
        loadAvailableModels,
        pinnedModels,
        unpinnedModels
    } from "../lib/state/board.svelte";
    import type { ModelCapabilities } from "../lib/openrouter/types";

    const {
        value,
        onSelect
    }: {
        value: string | null;
        onSelect: (id: string) => void;
    } = $props();

    let showAll = $state(false);
    let filter = $state("");

    const pinned = $derived(pinnedModels());
    const unpinned = $derived(
        unpinnedModels().filter(
            (m) =>
                filter.trim() === "" ||
                m.name.toLowerCase().includes(filter.trim().toLowerCase()) ||
                m.id.toLowerCase().includes(filter.trim().toLowerCase())
        )
    );

    function select(m: ModelCapabilities) {
        onSelect(m.id);
    }

    function label(m: ModelCapabilities): string {
        return m.estimated ? `${m.name} (capabilities estimated)` : m.name;
    }
</script>

<div class="model-picker">
    <div class="picker-header">
        <span class="picker-label">Model</span>
        {#if boardState.modelsLoading}
            <span class="loading-hint">Loading models…</span>
        {:else if boardState.modelsError}
            <button class="btn-ghost retry" onclick={loadAvailableModels}
                >Retry</button
            >
        {/if}
    </div>

    <select
        aria-label="Select model"
        onchange={(e) => onSelect((e.target as HTMLSelectElement).value)}
        value={value ?? ""}
        disabled={boardState.modelsLoading}
    >
        <option value="" disabled>Pick a model…</option>

        {#if pinned.length > 0}
            <optgroup label="— Suggested —">
                {#each pinned as m (m.id)}
                    <option
                        value={m.id}
                        title={m.estimated
                            ? "Capabilities estimated from defaults"
                            : ""}
                    >
                        {label(m)}
                    </option>
                {/each}
            </optgroup>
        {/if}

        {#if showAll}
            <optgroup label="— All image models —">
                {#each unpinned as m (m.id)}
                    <option
                        value={m.id}
                        title={m.estimated
                            ? "Capabilities estimated from defaults"
                            : ""}
                    >
                        {label(m)}
                    </option>
                {/each}
            </optgroup>
        {/if}
    </select>

    {#if !showAll}
        <button
            class="btn-ghost show-all"
            onclick={() => {
                showAll = true;
            }}
            disabled={boardState.modelsLoading}
        >
            Show all image models ({boardState.availableModels.length})
        </button>
    {:else}
        <div class="filter-row">
            <input
                type="text"
                bind:value={filter}
                placeholder="Filter models…"
                aria-label="Filter model list"
            />
        </div>
        <button
            class="btn-ghost show-all"
            onclick={() => {
                showAll = false;
                filter = "";
            }}
        >
            Hide full list
        </button>
    {/if}

    {#if value}
        {#each [boardState.availableModels.find((m) => m.id === value)].filter(Boolean) as m (m!.id)}
            {#if m!.estimated}
                <p class="estimated-note">
                    ⚠ Capabilities estimated from defaults for this model.
                </p>
            {/if}
            {#if !m!.conversational}
                <p class="i2i-note">
                    ℹ Image-only model — refinements use image-to-image, not
                    conversation.
                </p>
            {/if}
        {/each}
    {/if}
</div>

<style>
    .model-picker {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 260px;
    }
    .picker-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .picker-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--clr-text-2);
    }
    .loading-hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
    }
    .show-all {
        font-size: 0.75rem;
        padding: 2px 6px;
        align-self: flex-start;
    }
    .filter-row input {
        font-size: 0.8125rem;
        padding: 4px 8px;
    }
    .estimated-note,
    .i2i-note {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0;
    }
    .i2i-note {
        color: var(--clr-warning);
    }
</style>
