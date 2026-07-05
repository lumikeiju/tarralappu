<script lang="ts">
    import type { ModelCapabilities } from "../lib/openrouter/types";

    export interface ResolutionUpdate {
        aspectRatio?: string;
        imageSize?: string;
        quality?: string;
        background?: string;
        reasoningEffort?: "low" | "medium" | "high" | null;
        streamEnabled?: boolean;
    }

    const {
        aspectRatio,
        imageSize,
        quality,
        background,
        reasoningEffort,
        streamEnabled,
        capabilities,
        onChange
    }: {
        aspectRatio: string;
        imageSize: string;
        quality: string | null;
        background: string | null;
        reasoningEffort: "low" | "medium" | "high" | null;
        streamEnabled: boolean;
        capabilities: ModelCapabilities | undefined;
        onChange: (updates: ResolutionUpdate) => void;
    } = $props();

    const uid = $props.id();

    const aspectRatios = $derived(capabilities?.aspectRatios ?? []);
    const imageSizes = $derived(capabilities?.imageSizes ?? []);
    const qualities = $derived(capabilities?.quality ?? []);
    const backgrounds = $derived(capabilities?.background ?? []);
    const canStream = $derived(capabilities?.supportsStreaming ?? false);
    const show = $derived(
        (capabilities?.supportsImageConfig ?? false) || canStream
    );
    const isReasoningModel = $derived(
        capabilities?.id === "openai/gpt-5.4-image-2"
    );

    // These enums (per OpenRouter's image model discovery) always include
    // "auto" — use it as the displayed default until the user picks explicitly.
    const qualityValue = $derived(quality ?? "auto");
    const backgroundValue = $derived(background ?? "auto");
</script>

{#if show}
    <div class="resolution-controls">
        {#if aspectRatios.length > 0}
            <label class="res-label">
                <span>Aspect</span>
                <select
                    value={aspectRatio}
                    onchange={(e) =>
                        onChange({
                            aspectRatio: (e.target as HTMLSelectElement).value
                        })}
                    aria-label="Aspect ratio"
                >
                    {#each aspectRatios as ar (ar)}
                        <option value={ar}>{ar}</option>
                    {/each}
                </select>
            </label>
        {/if}

        {#if imageSizes.length > 0}
            <label class="res-label">
                <span>Size</span>
                <select
                    value={imageSize}
                    onchange={(e) =>
                        onChange({
                            imageSize: (e.target as HTMLSelectElement).value
                        })}
                    aria-label="Image size"
                >
                    {#each imageSizes as sz (sz)}
                        <option value={sz}>{sz}</option>
                    {/each}
                </select>
            </label>
        {/if}

        {#if qualities.length > 0}
            <label class="res-label">
                <span>Quality</span>
                <select
                    value={qualityValue}
                    onchange={(e) =>
                        onChange({
                            quality: (e.target as HTMLSelectElement).value
                        })}
                    aria-label="Image quality"
                >
                    {#each qualities as q (q)}
                        <option value={q}>{q}</option>
                    {/each}
                </select>
            </label>
        {/if}

        {#if backgrounds.length > 0}
            <label class="res-label">
                <span>Background</span>
                <select
                    value={backgroundValue}
                    onchange={(e) =>
                        onChange({
                            background: (e.target as HTMLSelectElement).value
                        })}
                    aria-label="Background"
                >
                    {#each backgrounds as bg (bg)}
                        <option value={bg}>{bg}</option>
                    {/each}
                </select>
            </label>
        {/if}

        {#if isReasoningModel}
            <label class="res-label">
                <span>Reasoning</span>
                <select
                    value={reasoningEffort ?? "none"}
                    onchange={(e) => {
                        const val = (e.target as HTMLSelectElement).value;
                        onChange({
                            reasoningEffort:
                                val === "none"
                                    ? null
                                    : (val as "low" | "medium" | "high")
                        });
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

        {#if canStream}
            <div class="stream-control">
                <label class="check-label">
                    <input
                        type="checkbox"
                        checked={streamEnabled}
                        onchange={(e) =>
                            onChange({
                                streamEnabled: (e.target as HTMLInputElement)
                                    .checked
                            })}
                        aria-describedby="{uid}-stream-hint"
                    />
                    Stream
                </label>
                <p id="{uid}-stream-hint" class="stream-hint">
                    Lets trashing a generating card stop billing immediately
                    instead of finishing in the background. This model sends the
                    finished image in one piece near the end regardless, so no
                    partial preview is available.
                </p>
            </div>
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
    .stream-control {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
    }
    .check-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--clr-text-2);
        cursor: pointer;
    }
    .check-label input[type="checkbox"] {
        width: auto;
        cursor: inherit;
    }
    .stream-hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0 0 0 22px;
    }
</style>
