<script lang="ts">
    import { tick } from "svelte";
    import type { Sketch } from "../lib/db/schema";
    import type { ModelCapabilities } from "../lib/openrouter/types";
    import {
        addSketchReference,
        removeSketchReference,
        selectEditSource,
        updateSketchReferences,
        extractRasterReference,
        clearMarkup
    } from "../lib/state/board.svelte";
    import MediaPreview from "./MediaPreview.svelte";
    import MarkupEditor from "./MarkupEditor.svelte";

    const {
        sketch,
        capabilities,
        parentImageIds
    }: {
        sketch: Sketch;
        capabilities: ModelCapabilities | undefined;
        parentImageIds: string[];
    } = $props();
    const references = $derived(sketch.referenceImageIds ?? []);
    let error = $state("");
    let busy = $state(false);
    let uploadInput = $state<HTMLInputElement>();

    async function action(run: () => Promise<void>) {
        busy = true;
        error = "";
        try {
            await run();
        } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
        } finally {
            busy = false;
        }
    }
    async function upload(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const files = [...(input.files ?? [])];
        await action(async () => {
            for (const file of files) await addSketchReference(sketch.id, file);
        });
        input.value = "";
    }
    function move(index: number, direction: number) {
        const next = [...references];
        const target = index + direction;
        [next[index], next[target]] = [next[target]!, next[index]!];
        void action(() =>
            updateSketchReferences(sketch.id, { referenceImageIds: next })
        );
    }
    async function remove(id: string) {
        await action(() => removeSketchReference(sketch.id, id));
        await tick();
        uploadInput?.focus();
    }
</script>

{#if capabilities?.generationApi === "images" && capabilities.maxInputImages > 0}
    <details class="sketch-references">
        <summary
            >Subject references and edit source ({references.length})</summary
        >
        <p>
            Up to {capabilities.maxInputImages} inputs total, including previous outputs
            and checked global references. PNG, JPEG, or WebP.
        </p>
        <label>
            Upload subject references
            <input
                bind:this={uploadInput}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                onchange={upload}
                disabled={busy}
            />
        </label>
        {#if parentImageIds.length || references.length}
            <label>
                Primary edit source
                <select
                    value={sketch.editSourceImageId ?? ""}
                    disabled={busy}
                    onchange={(event) =>
                        void action(() =>
                            selectEditSource(
                                sketch.id,
                                event.currentTarget.value || null
                            )
                        )}
                >
                    <option value=""
                        >Use previous outputs in order (legacy)</option
                    >
                    {#if sketch.editSourceImageId && ![...parentImageIds, ...references].includes(sketch.editSourceImageId)}
                        <option value={sketch.editSourceImageId}
                            >Unavailable edit source - choose another</option
                        >
                    {/if}
                    {#each parentImageIds as id, index (id)}<option value={id}
                            >Previous output {index + 1}</option
                        >{/each}
                    {#each references as id, index (id)}<option value={id}
                            >Subject reference {index + 1}</option
                        >{/each}
                </select>
            </label>
            <p>
                The chosen source is first. Markup must align to it. SVG and GIF
                must be explicitly converted to PNG before use as edit inputs.
            </p>
        {/if}
        {#each parentImageIds as id, index (id)}
            <details>
                <summary>Previous output {index + 1}</summary>
                <MediaPreview
                    imageId={id}
                    alt="Previous output {index + 1}"
                    compact
                    onConvert={() => extractRasterReference(sketch.id, id)}
                />
            </details>
        {/each}
        {#each references as id, index (id)}
            <div class="reference">
                <p>Subject reference {index + 1}</p>
                <MediaPreview
                    imageId={id}
                    alt="Subject reference {index + 1}"
                    compact
                />
                <div class="reference-actions">
                    <button
                        class="btn-ghost"
                        disabled={busy || index === 0}
                        onclick={() => move(index, -1)}
                        aria-label="Move subject reference {index + 1} earlier"
                        >Earlier</button
                    >
                    <button
                        class="btn-ghost"
                        disabled={busy || index === references.length - 1}
                        onclick={() => move(index, 1)}
                        aria-label="Move subject reference {index + 1} later"
                        >Later</button
                    >
                    <button
                        class="btn-ghost"
                        disabled={busy}
                        onclick={() => remove(id)}
                        aria-label="Remove subject reference {index + 1}"
                        >Remove</button
                    >
                </div>
            </div>
        {/each}
        {#if capabilities.advanced.markup}
            <MarkupEditor {sketch} />
        {:else if sketch.markup}
            <p>
                Saved markup is unavailable on this endpoint. Remove it or retry
                endpoint discovery before generating.
            </p>
            <MediaPreview
                imageId={sketch.markup.imageId}
                alt="Saved transparent markup layer"
                compact
            />
            <button
                class="btn-ghost"
                disabled={busy}
                onclick={() => action(() => clearMarkup(sketch.id))}
                >Remove saved markup</button
            >
        {/if}
        {#if busy}<p role="status">Updating references...</p>{/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
    </details>
{/if}

<style>
    .sketch-references {
        font-size: 0.8125rem;
        min-width: 0;
    }
    summary {
        cursor: pointer;
        min-height: 24px;
        padding-block: 4px;
        overflow-wrap: anywhere;
    }
    p {
        color: var(--clr-text-2);
        font-size: 0.75rem;
        margin-block: 6px;
    }
    label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-block: 8px;
    }
    input,
    select {
        width: 100%;
        min-width: 0;
    }
    .reference {
        border-top: 1px solid var(--clr-border);
        margin-top: 8px;
    }
    .reference-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .error {
        color: var(--clr-danger);
        overflow-wrap: anywhere;
    }
</style>
