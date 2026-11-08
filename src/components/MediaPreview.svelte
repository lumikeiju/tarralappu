<script lang="ts">
    import {
        getDisplayImage,
        createObjectUrl,
        revokeObjectUrl,
        setImageDescription
    } from "../lib/db/images";
    import type { StoredImage } from "../lib/db/schema";

    const {
        imageId,
        alt,
        compact = false,
        onConvert
    }: {
        imageId: string;
        alt: string;
        compact?: boolean;
        onConvert?: () => Promise<void>;
    } = $props();
    let image = $state<StoredImage | null>(null);
    let originalUrl = $state("");
    let posterUrl = $state("");
    let playing = $state(false);
    let error = $state("");
    let converting = $state(false);
    let status = $state("");
    let description = $state("");
    const extension = $derived(
        image?.mime === "image/svg+xml"
            ? "svg"
            : (image?.mime.split("/")[1] ?? "png")
    );

    $effect(() => {
        const id = imageId;
        let cancelled = false;
        const urls: string[] = [];
        image = null;
        error = "";
        playing = false;
        description = "";
        void getDisplayImage(id)
            .then((stored) => {
                if (cancelled) return;
                image = stored;
                description = stored.description ?? "";
                originalUrl = createObjectUrl(stored.blob);
                urls.push(originalUrl);
                posterUrl = stored.poster
                    ? createObjectUrl(stored.poster)
                    : originalUrl;
                if (posterUrl !== originalUrl) urls.push(posterUrl);
            })
            .catch((cause: unknown) => {
                if (!cancelled)
                    error =
                        cause instanceof Error ? cause.message : String(cause);
            });
        return () => {
            cancelled = true;
            urls.forEach(revokeObjectUrl);
        };
    });

    async function convert() {
        if (!onConvert) return;
        converting = true;
        error = "";
        try {
            await onConvert();
            status = "PNG reference created; the original is unchanged.";
        } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
        } finally {
            converting = false;
        }
    }

    async function saveDescription() {
        if (!image) return;
        const value = description.trim();
        if (value === (image.description ?? "")) return;
        error = "";
        try {
            await setImageDescription(image.id, value);
            image = { ...image, description: value || undefined };
            description = value;
            status = value
                ? "Image description saved."
                : "Image description cleared.";
        } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
        }
    }
</script>

<div class="media-preview" class:compact>
    {#if image}
        <img
            src={image.mime === "image/gif" && !playing
                ? posterUrl
                : originalUrl}
            alt={description.trim() || alt}
            width={image.width}
            height={image.height}
        />
        <div class="media-actions">
            {#if image.mime === "image/gif" && (image.frameCount ?? 0) > 1}
                <button
                    class="btn-ghost"
                    aria-pressed={playing}
                    onclick={() => (playing = !playing)}
                >
                    {playing ? "Pause animation" : "Play animation"}
                </button>
            {/if}
            <a
                class="btn-ghost"
                href={originalUrl}
                download="tarralappu-{imageId}.{extension}"
            >
                Download {extension.toUpperCase()}
            </a>
            {#if onConvert && (image.mime === "image/gif" || image.mime === "image/svg+xml")}
                <button
                    class="btn-ghost"
                    disabled={converting}
                    onclick={convert}
                >
                    {converting
                        ? "Converting..."
                        : image.mime === "image/gif"
                          ? "Use first frame as PNG"
                          : "Rasterize to PNG reference"}
                </button>
            {/if}
        </div>
        {#if !compact}
            <p class="media-info">
                {image.width} x {image.height} · {extension.toUpperCase()}
                {#if image.frameCount !== undefined}
                    · {image.frameCount} frame{image.frameCount === 1
                        ? ""
                        : "s"}
                    · {((image.durationMs ?? 0) / 1000).toFixed(2)} s
                {/if}
            </p>
        {/if}
        <details class="image-description" open={Boolean(image.description)}>
            <summary>Image description</summary>
            <label>
                Describe the visible content
                <textarea
                    bind:value={description}
                    maxlength="500"
                    rows="2"
                    placeholder="Describe the important visual details."
                    onblur={saveDescription}></textarea>
            </label>
            <p class="description-hint">
                Saved with this image and used as its alternative text.
            </p>
        </details>
    {:else if !error}
        <p role="status">Loading image...</p>
    {/if}
    {#if error}<p class="media-error" role="alert">{error}</p>{/if}
    {#if status}<p role="status">{status}</p>{/if}
</div>

<style>
    .media-preview {
        min-width: 0;
        max-width: 100%;
    }
    img {
        display: block;
        max-width: 100%;
        height: auto;
        margin-inline: auto;
        background-color: var(--clr-surface);
        background-image: repeating-conic-gradient(
            var(--clr-border-2) 0% 25%,
            transparent 0% 50%
        );
        background-size: 16px 16px;
    }
    .compact img {
        max-height: 140px;
        width: auto;
    }
    .media-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
    }
    .media-actions > * {
        min-height: 24px;
        overflow-wrap: anywhere;
    }
    .media-actions a {
        display: inline-flex;
        align-items: center;
    }
    .media-info {
        font-size: 0.75rem;
        color: var(--clr-text-2);
        margin-top: 4px;
    }
    .image-description {
        margin-top: 4px;
    }
    .image-description summary {
        cursor: pointer;
        min-height: 24px;
        padding-block: 4px;
    }
    .image-description label {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .image-description textarea {
        box-sizing: border-box;
        max-width: 100%;
        min-width: 0;
        width: 100%;
        font: inherit;
    }
    .description-hint {
        font-size: 0.75rem;
        color: var(--clr-text-2);
        margin-block: 4px;
    }
    .media-error {
        color: var(--clr-danger);
        overflow-wrap: anywhere;
    }
</style>
