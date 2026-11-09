<script lang="ts">
    import type { Sketch } from "../lib/db/schema";
    import type {
        AdvancedImageOptions,
        ModelCapabilities
    } from "../lib/openrouter/types";
    import { isGptImage26 } from "../lib/openrouter/capabilities";
    import { loadImageEndpoints } from "../lib/state/board.svelte";

    const {
        sketch,
        capabilities,
        unknownEstimate,
        onChange
    }: {
        sketch: Sketch;
        capabilities: ModelCapabilities | undefined;
        unknownEstimate: boolean;
        onChange: (updates: Partial<Sketch>) => Promise<void>;
    } = $props();
    const options = $derived(sketch.imageOptions ?? {});
    const advanced = $derived(capabilities?.advanced);
    const sunburst = $derived(isGptImage26(sketch.modelId));
    const animated = $derived(sketch.outputFormat === "gif");
    let error = $state("");
    const uid = $props.id();

    async function change(updates: Partial<Sketch>) {
        error = "";
        try {
            await onChange(updates);
        } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
        }
    }
    function option(updates: AdvancedImageOptions) {
        void change({ imageOptions: { ...options, ...updates } });
    }
    function number(value: string) {
        return value.trim() === "" ? null : Number(value);
    }
</script>

{#if sunburst}
    <details class="advanced-controls">
        <summary>Advanced image controls</summary>
        {#if advanced?.pending}
            <p role="status">Checking OpenRouter endpoint capabilities...</p>
        {:else if advanced?.error}
            <p role="alert" class="error">{advanced.error}</p>
            <button
                class="btn-ghost"
                onclick={() => void loadImageEndpoints(sketch.modelId, true)}
                >Retry endpoint discovery</button
            >
        {/if}
        {#if advanced?.complexity}
            <label>
                Complexity
                <select
                    value={options.complexity ?? ""}
                    aria-describedby="{uid}-complexity"
                    onchange={(event) => {
                        const value = event.currentTarget.value;
                        if (
                            value === "low" ||
                            value === "medium" ||
                            value === "high"
                        )
                            option({ complexity: value });
                        else option({ complexity: null });
                    }}
                >
                    <option value="">Provider default (High)</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </label>
            <p id="{uid}-complexity">
                Planning effort, separate from quality. Low suits focused edits;
                high can help dense layouts but may add latency or unwanted
                changes. No separate complexity fee.
            </p>
        {/if}
        {#if advanced?.moderation}
            <label>
                Moderation
                <select
                    value={options.moderation ?? ""}
                    onchange={(event) => {
                        const value = event.currentTarget.value;
                        option({
                            moderation:
                                value === "low"
                                    ? "low"
                                    : value === "auto"
                                      ? "auto"
                                      : null
                        });
                    }}
                >
                    <option value="">Provider default (Auto)</option>
                    <option value="auto">Auto</option>
                    <option value="low">Low</option>
                </select>
            </label>
            <p>
                Low is less restrictive; provider safety filtering still
                applies.
            </p>
        {/if}
        {#if advanced?.customSize && !animated}
            <label>
                Pixel size
                <input
                    type="text"
                    value={options.size ?? ""}
                    placeholder="auto or 1536x1024"
                    onchange={(event) =>
                        option({
                            size: event.currentTarget.value.trim() || null
                        })}
                />
            </label>
            <p>
                Multiples of 16; ratio 1:3-3:1; edges up to 3840;
                655,360-8,294,400 pixels. Sizes above 2560x1440 are
                experimental.
            </p>
        {/if}
        {#if animated}
            <p>
                Describe the subject, motion, and desired loop. GIF disables
                streaming and compression. Frame sizing is automatic within the
                provider's animation budget.
            </p>
            {#if advanced?.frameCount}
                <label
                    >GIF frames
                    <input
                        type="number"
                        min={advanced.frameCount.min}
                        max={advanced.frameCount.max}
                        step="1"
                        value={options.frameCount ?? ""}
                        placeholder="9"
                        onchange={(event) =>
                            option({
                                frameCount: number(event.currentTarget.value)
                            })}
                    />
                </label>
            {/if}
            {#if advanced?.frameDurationMs}
                <label
                    >Milliseconds per frame
                    <input
                        type="number"
                        min={advanced.frameDurationMs.min}
                        max={advanced.frameDurationMs.max}
                        step="10"
                        value={options.frameDurationMs ?? ""}
                        placeholder="200"
                        onchange={(event) =>
                            option({
                                frameDurationMs: number(
                                    event.currentTarget.value
                                )
                            })}
                    />
                </label>
            {/if}
            {#if advanced?.frameCount && advanced.frameDurationMs}
                <p>
                    Requested duration: {(
                        ((options.frameCount ?? 9) *
                            (options.frameDurationMs ?? 200)) /
                        1000
                    ).toFixed(2)} seconds.
                </p>
            {/if}
        {/if}
        {#if advanced?.partialImages && sketch.streamEnabled && !animated && (sketch.outputCount ?? 1) === 1}
            <label
                >Partial previews
                <input
                    type="number"
                    min={advanced.partialImages.min}
                    max={advanced.partialImages.max}
                    step="1"
                    value={options.partialImages ?? ""}
                    placeholder="Provider default"
                    onchange={(event) =>
                        option({
                            partialImages: number(event.currentTarget.value)
                        })}
                />
            </label>
            <p>The provider may return fewer previews than requested.</p>
        {/if}
        <details>
            <summary>OpenRouter feature availability</summary>
            <ul>
                {#if !advanced?.customSize}<li>
                        Custom pixel sizing: not confirmed by endpoint
                        discovery.
                    </li>{/if}
                {#if !advanced?.frameCount || !advanced.frameDurationMs}<li>
                        GIF frame controls: documented by OpenRouter, but not
                        confirmed by endpoint discovery. Provider defaults
                        apply.
                    </li>{/if}
                {#if !advanced?.markup}<li>
                        Markup edits: documented by OpenRouter, but not
                        confirmed by endpoint discovery.
                    </li>{/if}
                <li>
                    Masks and SVG author selection: not confirmed through
                    OpenRouter.
                </li>
                {#if !capabilities?.outputFormats.includes("svg")}<li>
                        SVG generation: not offered by this endpoint.
                    </li>{/if}
                {#if !advanced?.partialImages}<li>
                        Preview count: unavailable; raster streaming uses
                        provider defaults.
                    </li>{/if}
            </ul>
        </details>
        <button
            class="btn-ghost"
            onclick={() => void change({ imageOptions: {} })}
            >Reset advanced options to provider defaults</button
        >
    </details>
{/if}
{#if unknownEstimate && capabilities?.generationApi === "images"}
    <p class="budget-hint" id="{uid}-budget">
        Cost estimate unavailable for this request. Quality, size, references,
        outputs, and animation can change the bill. A local cap cannot prevent
        an unknown-cost request from exceeding it; use an OpenRouter key
        spending limit.
    </p>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
    .advanced-controls {
        font-size: 0.8125rem;
    }
    summary {
        cursor: pointer;
        min-height: 24px;
        padding-block: 4px;
    }
    label {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
    }
    input,
    select {
        min-width: 0;
        max-width: 100%;
    }
    p,
    ul {
        font-size: 0.75rem;
        color: var(--clr-text-2);
        margin-top: 6px;
        overflow-wrap: anywhere;
    }
    ul {
        padding-left: 18px;
    }
    .error {
        color: var(--clr-danger);
    }
</style>
