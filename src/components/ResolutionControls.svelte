<script lang="ts">
    import type { ModelCapabilities } from "../lib/openrouter/types";

    const {
        aspectRatio,
        imageSize,
        reasoningEffort,
        capabilities,
        onChange
    }: {
        aspectRatio: string;
        imageSize: string;
        reasoningEffort: "low" | "medium" | "high" | null;
        capabilities: ModelCapabilities | undefined;
        onChange: (
            ar: string,
            sz: string,
            re: "low" | "medium" | "high" | null
        ) => void;
    } = $props();

    const aspectRatios = $derived(capabilities?.aspectRatios ?? ["1:1"]);
    const imageSizes = $derived(capabilities?.imageSizes ?? ["1K"]);
    const show = $derived(capabilities?.supportsImageConfig ?? false);
    const isReasoningModel = $derived(
        capabilities?.id === "openai/gpt-5.4-image-2"
    );
</script>

{#if show}
    <div class="resolution-controls">
        <label class="res-label">
            <span>Aspect</span>
            <select
                value={aspectRatio}
                onchange={(e) =>
                    onChange(
                        (e.target as HTMLSelectElement).value,
                        imageSize,
                        reasoningEffort
                    )}
                aria-label="Aspect ratio"
            >
                {#each aspectRatios as ar (ar)}
                    <option value={ar}>{ar}</option>
                {/each}
            </select>
        </label>

        <label class="res-label">
            <span>Size</span>
            <select
                value={imageSize}
                onchange={(e) =>
                    onChange(
                        aspectRatio,
                        (e.target as HTMLSelectElement).value,
                        reasoningEffort
                    )}
                aria-label="Image size"
            >
                {#each imageSizes as sz (sz)}
                    <option value={sz}>{sz}</option>
                {/each}
            </select>
        </label>

        {#if isReasoningModel}
            <label class="res-label">
                <span>Reasoning</span>
                <select
                    value={reasoningEffort ?? "none"}
                    onchange={(e) => {
                        const val = (e.target as HTMLSelectElement).value;
                        onChange(
                            aspectRatio,
                            imageSize,
                            val === "none"
                                ? null
                                : (val as "low" | "medium" | "high")
                        );
                    }}
                    aria-label="Reasoning effort"
                >
                    <option value="none">Off</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </label>
        {/if}
    </div>
{/if}

<style>
    .resolution-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    .res-label {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.8125rem;
        color: var(--clr-text-2);
        font-weight: 500;
        white-space: nowrap;
    }
    .res-label select {
        width: auto;
        font-size: 0.8125rem;
        padding: 2px 6px;
    }
</style>
