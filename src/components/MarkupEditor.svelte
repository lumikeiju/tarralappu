<script lang="ts">
    import type { Sketch, StoredImage } from "../lib/db/schema";
    import {
        getDisplayImage,
        createObjectUrl,
        revokeObjectUrl
    } from "../lib/db/images";
    import { canvasBlob } from "../lib/db/media";
    import { attachMarkup, clearMarkup } from "../lib/state/board.svelte";
    import MediaPreview from "./MediaPreview.svelte";

    interface Shape {
        kind: "circle" | "rectangle" | "arrow";
        x: number;
        y: number;
        width: number;
        height: number;
    }
    const { sketch }: { sketch: Sketch } = $props();
    let base = $state<StoredImage | null>(null);
    let baseUrl = $state("");
    let shapes = $state<Shape[]>([]);
    let undo = $state<Shape[][]>([]);
    let redo = $state<Shape[][]>([]);
    let canvas = $state<HTMLCanvasElement>();
    let error = $state("");
    let status = $state("");
    let busy = $state(false);

    const copy = (items: Shape[]) => items.map((shape) => ({ ...shape }));
    function change(next: Shape[]) {
        undo = [...undo, copy(shapes)];
        redo = [];
        shapes = next;
    }
    function add() {
        if (!base?.width || !base.height) return;
        change([
            ...shapes,
            {
                kind: "circle",
                x: Math.round(base.width / 4),
                y: Math.round(base.height / 4),
                width: Math.round(base.width / 2),
                height: Math.round(base.height / 2)
            }
        ]);
    }
    function field(
        index: number,
        key: "x" | "y" | "width" | "height",
        value: string
    ) {
        const next = copy(shapes);
        next[index]![key] = Number(value);
        change(next);
    }
    $effect(() => {
        const id = sketch.editSourceImageId;
        let cancelled = false;
        let url = "";
        base = null;
        shapes = [];
        undo = [];
        redo = [];
        error = "";
        if (id)
            void getDisplayImage(id)
                .then((image) => {
                    if (cancelled) return;
                    if (
                        !["image/png", "image/jpeg", "image/webp"].includes(
                            image.mime
                        )
                    )
                        throw new Error(
                            "Convert this source to raster PNG before annotating."
                        );
                    base = image;
                    url = createObjectUrl(image.blob);
                    baseUrl = url;
                })
                .catch((cause: unknown) => {
                    if (!cancelled)
                        error =
                            cause instanceof Error
                                ? cause.message
                                : String(cause);
                });
        return () => {
            cancelled = true;
            if (url) revokeObjectUrl(url);
        };
    });
    $effect(() => {
        if (!canvas || !base?.width || !base.height) return;
        canvas.width = base.width;
        canvas.height = base.height;
        const context = canvas.getContext("2d");
        if (!context) {
            error = "Canvas annotations are not available in this browser.";
            return;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = getComputedStyle(canvas)
            .getPropertyValue("--clr-danger")
            .trim();
        context.fillStyle = context.strokeStyle;
        context.lineWidth = Math.max(2, base.width / 250);
        context.font = `${Math.max(12, base.width / 40)}px sans-serif`;
        shapes.forEach((shape, index) => {
            if (
                ![shape.x, shape.y, shape.width, shape.height].every(
                    Number.isFinite
                ) ||
                shape.width <= 0 ||
                shape.height <= 0
            )
                return;
            context.beginPath();
            if (shape.kind === "rectangle")
                context.rect(shape.x, shape.y, shape.width, shape.height);
            else if (shape.kind === "circle")
                context.ellipse(
                    shape.x + shape.width / 2,
                    shape.y + shape.height / 2,
                    shape.width / 2,
                    shape.height / 2,
                    0,
                    0,
                    Math.PI * 2
                );
            else {
                const endX = shape.x + shape.width;
                const endY = shape.y + shape.height;
                const angle = Math.atan2(shape.height, shape.width);
                const length = Math.max(8, base!.width! / 40);
                context.moveTo(shape.x, shape.y);
                context.lineTo(endX, endY);
                context.moveTo(
                    endX - length * Math.cos(angle - Math.PI / 6),
                    endY - length * Math.sin(angle - Math.PI / 6)
                );
                context.lineTo(endX, endY);
                context.lineTo(
                    endX - length * Math.cos(angle + Math.PI / 6),
                    endY - length * Math.sin(angle + Math.PI / 6)
                );
            }
            context.stroke();
            context.fillText(String(index + 1), shape.x, Math.max(16, shape.y));
        });
    });
    async function action(run: () => Promise<void>) {
        error = "";
        status = "";
        busy = true;
        try {
            await run();
            status =
                "Markup updated. Describe the change and what to preserve in your prompt.";
        } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
        } finally {
            busy = false;
        }
    }
    async function save() {
        if (!canvas || !base) return;
        await action(async () => {
            if (!shapes.length)
                throw new Error("Add an annotation before saving.");
            if (
                shapes.some(
                    (shape) =>
                        ![shape.x, shape.y, shape.width, shape.height].every(
                            Number.isFinite
                        ) ||
                        shape.x < 0 ||
                        shape.y < 0 ||
                        shape.width <= 0 ||
                        shape.height <= 0 ||
                        shape.x + shape.width > base!.width! ||
                        shape.y + shape.height > base!.height!
                )
            ) {
                throw new Error(
                    "Annotation coordinates must be positive and stay within the base image."
                );
            }
            await attachMarkup(sketch.id, base!.id, await canvasBlob(canvas!));
        });
    }
    async function upload(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (file && base)
            await action(() => attachMarkup(sketch.id, base!.id, file));
        input.value = "";
    }
</script>

<details class="markup-editor">
    <summary>Markup-guided edit</summary>
    {#if base}
        <p>
            Numbered annotations guide the edit; they are not an exact mask. The
            transparent overlay is sent separately from the source.
        </p>
        <div class="annotation-preview">
            <img
                src={baseUrl}
                alt={base.description?.trim() || "Selected base for annotation"}
                width={base.width}
                height={base.height}
            />
            <canvas bind:this={canvas} aria-hidden="true"></canvas>
        </div>
        {#each shapes as shape, index (index)}
            <fieldset>
                <legend>Annotation {index + 1}</legend>
                <label
                    >Shape <select
                        value={shape.kind}
                        onchange={(event) => {
                            const next = copy(shapes);
                            const value = event.currentTarget.value;
                            next[index]!.kind =
                                value === "rectangle"
                                    ? "rectangle"
                                    : value === "arrow"
                                      ? "arrow"
                                      : "circle";
                            change(next);
                        }}
                        ><option value="circle">Circle</option><option
                            value="rectangle">Rectangle</option
                        ><option value="arrow">Arrow</option></select
                    ></label
                >
                {#each ["x", "y", "width", "height"] as key}
                    <label
                        >{key}<input
                            type="number"
                            min={key === "x" || key === "y" ? 0 : 1}
                            step="1"
                            value={shape[key as keyof Omit<Shape, "kind">]}
                            onchange={(event) =>
                                field(
                                    index,
                                    key as keyof Omit<Shape, "kind">,
                                    event.currentTarget.value
                                )}
                        /></label
                    >
                {/each}
            </fieldset>
        {/each}
        <div class="actions">
            <button class="btn-ghost" disabled={busy} onclick={add}
                >Add annotation</button
            >
            <button
                class="btn-ghost"
                disabled={busy || !undo.length}
                onclick={() => {
                    redo = [...redo, copy(shapes)];
                    shapes = undo.at(-1)!;
                    undo = undo.slice(0, -1);
                }}>Undo</button
            >
            <button
                class="btn-ghost"
                disabled={busy || !redo.length}
                onclick={() => {
                    undo = [...undo, copy(shapes)];
                    shapes = redo.at(-1)!;
                    redo = redo.slice(0, -1);
                }}>Redo</button
            >
            <button
                class="btn-ghost"
                disabled={busy || !shapes.length}
                onclick={() => change([])}>Clear annotations</button
            >
            <button
                class="btn-ghost"
                disabled={busy || !shapes.length}
                onclick={save}>Save transparent markup</button
            >
        </div>
        <label
            >Upload matching transparent PNG<input
                type="file"
                accept="image/png"
                onchange={upload}
                disabled={busy}
            /></label
        >
    {:else}
        <p>Select a primary raster edit source before adding markup.</p>
    {/if}
    {#if sketch.markup}
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
    {#if busy}<p role="status">Validating markup...</p>{/if}
    {#if status}<p role="status">{status}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
</details>

<style>
    summary {
        cursor: pointer;
        min-height: 24px;
        padding-block: 4px;
    }
    p {
        color: var(--clr-text-2);
        font-size: 0.75rem;
        margin-block: 6px;
    }
    .annotation-preview {
        position: relative;
    }
    .annotation-preview img {
        display: block;
        max-width: 100%;
        height: auto;
    }
    canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    fieldset {
        border: 1px solid var(--clr-input-border);
        padding: 6px;
        margin-block: 8px;
        min-width: 0;
    }
    label {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-block: 6px;
    }
    input,
    select {
        min-width: 0;
        max-width: 100%;
    }
    input[type="number"] {
        width: 80px;
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .error {
        color: var(--clr-danger);
        overflow-wrap: anywhere;
    }
</style>
