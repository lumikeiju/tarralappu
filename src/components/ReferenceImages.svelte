<script lang="ts">
    import { boardState, updateBoardSettings } from "../lib/state/board.svelte";
    import {
        replaceGlobalImage,
        deleteGlobalImage,
        validateImageFile,
        getStoredImage,
        createObjectUrl,
        revokeObjectUrl
    } from "../lib/db/images";
    import { onDestroy } from "svelte";

    // Object URLs for display — revoke on teardown
    let styleRefUrl = $state<string | null>(null);
    let layoutRefUrl = $state<string | null>(null);

    // Load object URLs when IDs change
    $effect(() => {
        const id = boardState.board?.settings.styleRefImageId;
        if (!id) {
            if (styleRefUrl) {
                revokeObjectUrl(styleRefUrl);
                styleRefUrl = null;
            }
            return;
        }
        getStoredImage(id).then((img) => {
            if (styleRefUrl) revokeObjectUrl(styleRefUrl);
            styleRefUrl = img ? createObjectUrl(img.blob) : null;
        });
    });
    $effect(() => {
        const id = boardState.board?.settings.layoutRefImageId;
        if (!id) {
            if (layoutRefUrl) {
                revokeObjectUrl(layoutRefUrl);
                layoutRefUrl = null;
            }
            return;
        }
        getStoredImage(id).then((img) => {
            if (layoutRefUrl) revokeObjectUrl(layoutRefUrl);
            layoutRefUrl = img ? createObjectUrl(img.blob) : null;
        });
    });

    onDestroy(() => {
        if (styleRefUrl) revokeObjectUrl(styleRefUrl);
        if (layoutRefUrl) revokeObjectUrl(layoutRefUrl);
    });

    let styleError = $state<string | null>(null);
    let layoutError = $state<string | null>(null);

    async function uploadStyle(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        styleError = validateImageFile(file);
        if (styleError) return;
        const oldId = boardState.board?.settings.styleRefImageId ?? null;
        const stored = await replaceGlobalImage(oldId, file, "styleRef");
        await updateBoardSettings({ styleRefImageId: stored.id });
    }

    async function uploadLayout(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        layoutError = validateImageFile(file);
        if (layoutError) return;
        const oldId = boardState.board?.settings.layoutRefImageId ?? null;
        const stored = await replaceGlobalImage(oldId, file, "layoutRef");
        await updateBoardSettings({ layoutRefImageId: stored.id });
    }

    async function removeStyle() {
        const id = boardState.board?.settings.styleRefImageId;
        if (id) await deleteGlobalImage(id);
        await updateBoardSettings({ styleRefImageId: null });
    }

    async function removeLayout() {
        const id = boardState.board?.settings.layoutRefImageId;
        if (id) await deleteGlobalImage(id);
        await updateBoardSettings({ layoutRefImageId: null });
    }
</script>

<section class="ref-images" aria-label="Reference images">
    <h2 class="ref-title">Reference Images</h2>

    <div class="ref-grid">
        <!-- Style Reference -->
        <div class="ref-slot">
            <span class="ref-slot__label">Style Reference</span>
            <p class="ref-slot__hint">Palette, texture, mood</p>
            {#if styleRefUrl}
                <div class="ref-preview">
                    <img
                        src={styleRefUrl}
                        alt="Style reference"
                        class="ref-img"
                        width="100"
                        height="100"
                    />
                    <button
                        class="btn-icon remove-btn"
                        onclick={removeStyle}
                        aria-label="Remove style reference">✕</button
                    >
                </div>
            {:else}
                <label class="upload-label">
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onchange={uploadStyle}
                        class="sr-only"
                    />
                    <span class="upload-btn btn-ghost">
                        <span class="upload-btn__title">Upload style ref</span>
                        <span class="upload-btn__formats"
                            >PNG / JPEG / WebP</span
                        >
                    </span>
                </label>
                {#if styleError}
                    <p class="ref-error" role="alert">{styleError}</p>
                {/if}
            {/if}
        </div>

        <!-- Layout Reference -->
        <div class="ref-slot">
            <span class="ref-slot__label">Layout Reference</span>
            <p class="ref-slot__hint">Composition, placement</p>
            {#if layoutRefUrl}
                <div class="ref-preview">
                    <img
                        src={layoutRefUrl}
                        alt="Layout reference"
                        class="ref-img"
                        width="100"
                        height="100"
                    />
                    <button
                        class="btn-icon remove-btn"
                        onclick={removeLayout}
                        aria-label="Remove layout reference">✕</button
                    >
                </div>
            {:else}
                <label class="upload-label">
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onchange={uploadLayout}
                        class="sr-only"
                    />
                    <span class="upload-btn btn-ghost">
                        <span class="upload-btn__title">Upload layout ref</span>
                        <span class="upload-btn__formats"
                            >PNG / JPEG / WebP</span
                        >
                    </span>
                </label>
                {#if layoutError}
                    <p class="ref-error" role="alert">{layoutError}</p>
                {/if}
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
    .ref-preview {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
    }
    .ref-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 4px;
        border: 1px solid var(--clr-border);
    }
    .remove-btn {
        position: absolute;
        top: 4px;
        right: 4px;
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
