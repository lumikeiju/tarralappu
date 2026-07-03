<script lang="ts">
    import { boardState, loadAvailableModels } from "../lib/state/board.svelte";
    import type { ModelCapabilities } from "../lib/openrouter/types";
    import { formatModelPricing, pricingTier } from "../lib/openrouter/cost";

    const {
        value,
        onSelect
    }: {
        value: string | null;
        onSelect: (id: string) => void;
    } = $props();

    const uid = $props.id();
    const groupName = `model-picker-${uid}`;

    let filter = $state("");

    // Friendly display names for known creators (model id prefix before "/").
    const CREATOR_LABELS: Record<string, string> = {
        google: "Google",
        openai: "OpenAI",
        anthropic: "Anthropic",
        "black-forest-labs": "Black Forest Labs",
        "bytedance-seed": "ByteDance Seed",
        microsoft: "Microsoft",
        recraft: "Recraft",
        sourceful: "Sourceful",
        "x-ai": "xAI",
        openrouter: "OpenRouter"
    };

    function creatorKey(id: string): string {
        return id.split("/")[0] ?? id;
    }

    function creatorLabel(key: string): string {
        return (
            CREATOR_LABELS[key] ??
            key
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
        );
    }

    function label(m: ModelCapabilities): string {
        return m.estimated ? `${m.name} (capabilities estimated)` : m.name;
    }

    interface CreatorGroup {
        key: string;
        label: string;
        models: ModelCapabilities[];
    }

    const groups = $derived.by((): CreatorGroup[] => {
        const term = filter.trim().toLowerCase();
        const filtered = boardState.availableModels.filter(
            (m) =>
                term === "" ||
                m.name.toLowerCase().includes(term) ||
                m.id.toLowerCase().includes(term)
        );
        const byCreator = new Map<string, ModelCapabilities[]>();
        for (const m of filtered) {
            const key = creatorKey(m.id);
            const list = byCreator.get(key);
            if (list) list.push(m);
            else byCreator.set(key, [m]);
        }
        return [...byCreator.entries()]
            .map(([key, models]) => ({
                key,
                label: creatorLabel(key),
                models: [...models].sort((a, b) => a.name.localeCompare(b.name))
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    });

    const selectedModel = $derived(
        boardState.availableModels.find((m) => m.id === value)
    );
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

    <input
        type="text"
        bind:value={filter}
        placeholder="Filter models…"
        aria-label="Filter model list"
        disabled={boardState.modelsLoading}
    />

    <div class="model-groups">
        {#each groups as group, i (group.key)}
            {#if i > 0}
                <hr class="group-sep" />
            {/if}
            <fieldset class="creator-group">
                <legend>{group.label}</legend>
                {#each group.models as m (m.id)}
                    {@const tier = pricingTier(m.pricing, m.id)}
                    <label class="model-option">
                        <input
                            type="radio"
                            name={groupName}
                            value={m.id}
                            checked={value === m.id}
                            disabled={boardState.modelsLoading}
                            onchange={() => onSelect(m.id)}
                        />
                        <span class="model-name" title={m.id}>{label(m)}</span>
                        {#if tier}
                            <span
                                class="price-tier"
                                data-tier={tier}
                                title="Relative cost tier: {tier}"
                            >
                                {tier}
                            </span>
                        {/if}
                        <span class="model-price"
                            >{formatModelPricing(m.pricing, m.id) ??
                                "pricing not listed"}</span
                        >
                    </label>
                {/each}
            </fieldset>
        {/each}
        {#if groups.length === 0}
            <p class="no-results">
                {boardState.modelsLoading
                    ? "Loading models…"
                    : `No models match "${filter}".`}
            </p>
        {/if}
    </div>

    {#if selectedModel}
        {#if selectedModel.estimated}
            <p class="estimated-note">
                ⚠ Capabilities estimated from defaults for this model.
            </p>
        {/if}
        {#if !selectedModel.conversational}
            <p class="i2i-note">
                ℹ Image-only model — refinements use image-to-image, not
                conversation.
            </p>
        {/if}
    {/if}
</div>

<style>
    .model-picker {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 260px;
        width: 100%;
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

    .model-groups {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 320px;
        overflow-y: auto;
        border: 1px solid var(--clr-border);
        border-radius: 4px;
        padding: 8px 10px;
        background: var(--clr-surface-2);
    }
    .group-sep {
        border: none;
        border-top: 1px solid var(--clr-border);
        margin: 4px 0;
        width: 100%;
    }
    .creator-group {
        border: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .creator-group legend {
        font-size: 0.6875rem;
        font-weight: 700;
        font-family: var(--font-display);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--clr-text-3);
        padding: 0;
        margin-bottom: 2px;
    }
    .model-option {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 0.8125rem;
        color: var(--clr-text);
        cursor: pointer;
        padding: 3px 2px;
        border-radius: 3px;
    }
    .model-option:hover {
        background: var(--clr-surface);
    }
    .model-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .price-tier {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        font-size: 0.6875rem;
        font-weight: 700;
        font-family: var(--font-display);
        letter-spacing: 0.02em;
        padding: 1px 6px;
        border-radius: 10px;
        background: var(--clr-success-bg);
        color: var(--clr-success);
    }
    .price-tier[data-tier="$$"] {
        background: var(--clr-warning-bg);
        color: var(--clr-warning);
    }
    .price-tier[data-tier="$$$"] {
        background: var(--clr-danger-bg);
        color: var(--clr-danger);
    }
    .model-price {
        font-size: 0.6875rem;
        color: var(--clr-text-3);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .no-results {
        font-size: 0.8125rem;
        color: var(--clr-text-3);
        margin: 0;
        padding: 4px 2px;
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
