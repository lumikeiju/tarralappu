<script lang="ts">
    import {
        boardState,
        updateGlobalReference
    } from "../lib/state/board.svelte";
    import { tick } from "svelte";
    import MediaPreview from "./MediaPreview.svelte";

    const styleRefId = $derived(
        boardState.board?.settings.styleRefImageId ?? null
    );
    const layoutRefId = $derived(
        boardState.board?.settings.layoutRefImageId ?? null
    );

    const feedback = $state({
        style: { busy: false, error: "", status: "" },
        layout: { busy: false, error: "", status: "" }
    });
    let styleUploadInput = $state<HTMLInputElement>();
    let layoutUploadInput = $state<HTMLInputElement>();
    let styleRemoveButton = $state<HTMLButtonElement>();
    let layoutRemoveButton = $state<HTMLButtonElement>();

    async function changeReference(
        kind: "style" | "layout",
        file: File | null
    ) {
        const slot = feedback[kind];
        if (slot.busy) return;
        slot.busy = true;
        slot.error = "";
        slot.status = "";
        try {
            await updateGlobalReference(`${kind}RefImageId`, file);
            const label = kind === "style" ? "Style" : "Layout";
            slot.status = `${label} reference ${file ? "uploaded" : "removed"}.`;
        } catch (cause) {
            slot.error = cause instanceof Error ? cause.message : String(cause);
        } finally {
            slot.busy = false;
        }
        await tick();
        const control =
            kind === "style"
                ? (styleRemoveButton ?? styleUploadInput)
                : (layoutRemoveButton ?? layoutUploadInput);
        if (document.activeElement === document.body) control?.focus();
    }

    function uploadReference(
        kind: "style" | "layout",
        input: HTMLInputElement
    ) {
        const file = input.files?.[0];
        input.value = "";
        if (file) void changeReference(kind, file);
    }
</script>

<section class="ref-images" aria-label="Reference images">
    <h2 class="ref-title">Reference Images</h2>

    <div class="ref-grid">
        <!-- Style Reference -->
        <div class="ref-slot">
            <div class="ref-slot__header">
                <div class="ref-slot__copy">
                    <span class="ref-slot__label">Style Reference</span>
                    <p class="ref-slot__hint">Palette, texture, mood</p>
                </div>
                {#if styleRefId}
                    <button
                        bind:this={styleRemoveButton}
                        class="btn-icon remove-btn"
                        onclick={() => changeReference("style", null)}
                        disabled={feedback.style.busy}
                        aria-label="Remove style reference"
                    >
                        ✕
                    </button>
                {/if}
            </div>
            {#if styleRefId}
                <div class="ref-preview">
                    <MediaPreview
                        imageId={styleRefId}
                        alt="Style reference"
                        compact
                    />
                </div>
            {:else}
                <label class="upload-label">
                    <input
                        type="file"
                        bind:this={styleUploadInput}
                        accept="image/png,image/jpeg,image/webp"
                        onchange={(event) =>
                            uploadReference("style", event.currentTarget)}
                        disabled={feedback.style.busy}
                        class="sr-only"
                    />
                    <span class="upload-btn btn-ghost">
                        <span class="upload-btn__title">Upload style ref</span>
                        <span class="upload-btn__formats">
                            PNG / JPEG / WebP
                        </span>
                    </span>
                </label>
            {/if}
            {#if feedback.style.error}
                <p class="ref-error" role="alert">{feedback.style.error}</p>
            {/if}
            {#if feedback.style.status}
                <p class="ref-status" role="status">{feedback.style.status}</p>
            {/if}
        </div>

        <!-- Layout Reference -->
        <div class="ref-slot">
            <div class="ref-slot__header">
                <div class="ref-slot__copy">
                    <span class="ref-slot__label">Layout Reference</span>
                    <p class="ref-slot__hint">Composition, placement</p>
                </div>
                {#if layoutRefId}
                    <button
                        bind:this={layoutRemoveButton}
                        class="btn-icon remove-btn"
                        onclick={() => changeReference("layout", null)}
                        disabled={feedback.layout.busy}
                        aria-label="Remove layout reference"
                    >
                        ✕
                    </button>
                {/if}
            </div>
            {#if layoutRefId}
                <div class="ref-preview">
                    <MediaPreview
                        imageId={layoutRefId}
                        alt="Layout reference"
                        compact
                    />
                </div>
            {:else}
                <label class="upload-label">
                    <input
                        type="file"
                        bind:this={layoutUploadInput}
                        accept="image/png,image/jpeg,image/webp"
                        onchange={(event) =>
                            uploadReference("layout", event.currentTarget)}
                        disabled={feedback.layout.busy}
                        class="sr-only"
                    />
                    <span class="upload-btn btn-ghost">
                        <span class="upload-btn__title">Upload layout ref</span>
                        <span class="upload-btn__formats">
                            PNG / JPEG / WebP
                        </span>
                    </span>
                </label>
            {/if}
            {#if feedback.layout.error}
                <p class="ref-error" role="alert">{feedback.layout.error}</p>
            {/if}
            {#if feedback.layout.status}
                <p class="ref-status" role="status">{feedback.layout.status}</p>
            {/if}
        </div>
    </div>
</section>

<style>
    .ref-images {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .ref-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--clr-text);
        margin: 0;
    }
    .ref-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }
    .ref-slot {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .ref-slot__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
    }
    .ref-slot__copy {
        display: flex;
        flex-direction: column;
    }
    .ref-slot__label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--clr-text-2);
    }
    .ref-slot__hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0;
    }
    .ref-status {
        font-size: 0.75rem;
        color: var(--clr-text-2);
        margin: 0;
    }
    .ref-preview :global(.media-preview img) {
        max-height: 100px;
    }
    .remove-btn {
        background: var(--clr-text);
        color: var(--clr-surface);
        border-radius: 50%;
        width: 32px;
        height: 32px;
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .remove-btn:hover:not(:disabled) {
        background: var(--clr-accent);
        color: var(--clr-accent-fg);
    }
    .upload-label {
        display: block;
        cursor: pointer;
    }
    .upload-label:focus-within .upload-btn {
        outline: 2px solid transparent;
        box-shadow: var(--focus-ring);
    }
    .upload-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        text-align: center;
        font-size: 0.75rem;
        padding: 6px 8px;
        border: 1px solid var(--clr-border);
        background: var(--clr-surface-2);
        color: var(--clr-text);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        transition:
            background 0.1s,
            border-color 0.1s,
            color 0.1s,
            box-shadow 0.1s;
    }
    .upload-label:hover .upload-btn {
        background: var(--clr-accent);
        border-color: var(--clr-accent);
        color: var(--clr-accent-fg);
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.14);
    }
    .upload-btn__title {
        font-weight: 600;
    }
    .upload-btn__formats {
        font-size: 0.6875rem;
        color: var(--clr-text-3);
    }
    .upload-label:hover .upload-btn__formats {
        color: var(--clr-accent-fg);
    }
    .ref-error {
        font-size: 0.75rem;
        color: var(--clr-danger);
        margin: 0;
    }
</style>
