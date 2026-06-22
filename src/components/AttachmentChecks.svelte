<script lang="ts">
    import type { AttachFlags } from "../lib/db/schema";
    import type { ModelCapabilities } from "../lib/openrouter/types";

    const {
        attach,
        capabilities,
        hasStyleDoc,
        hasStyleRef,
        hasLayoutRef,
        isRefinement,
        onChange
    }: {
        attach: AttachFlags;
        capabilities: ModelCapabilities | undefined;
        hasStyleDoc: boolean;
        hasStyleRef: boolean;
        hasLayoutRef: boolean;
        isRefinement: boolean;
        onChange: (flags: AttachFlags) => void;
    } = $props();

    function currentImageCount(flags: AttachFlags): number {
        let n = isRefinement ? 1 : 0; // parent image for refinement i2i
        if (flags.styleRef && hasStyleRef) n++;
        if (flags.layoutRef && hasLayoutRef) n++;
        return n;
    }

    function toggle(field: keyof AttachFlags) {
        const next = { ...attach, [field]: !attach[field] };
        // Check if the result would exceed the model's maxInputImages
        const maxImages = capabilities?.maxInputImages ?? 99;
        if (currentImageCount(next) > maxImages) return; // silently block
        onChange(next);
    }
</script>

<fieldset class="attach-checks">
    <legend class="sr-only">Attachments</legend>

    <label class="check-label" class:disabled={!hasStyleDoc}>
        <input
            type="checkbox"
            checked={attach.styleDoc}
            disabled={!hasStyleDoc}
            onchange={() => toggle("styleDoc")}
            aria-describedby={!hasStyleDoc ? "no-style-doc-hint" : undefined}
        />
        Attach Style Description
    </label>
    {#if !hasStyleDoc}
        <p id="no-style-doc-hint" class="check-hint">
            No style guide set above.
        </p>
    {/if}

    <label class="check-label" class:disabled={!hasStyleRef}>
        <input
            type="checkbox"
            checked={attach.styleRef}
            disabled={!hasStyleRef}
            onchange={() => toggle("styleRef")}
            aria-describedby={!hasStyleRef ? "no-style-ref-hint" : undefined}
        />
        Attach Style Reference
    </label>
    {#if !hasStyleRef}
        <p id="no-style-ref-hint" class="check-hint">
            No style reference image uploaded.
        </p>
    {/if}

    <label class="check-label" class:disabled={!hasLayoutRef}>
        <input
            type="checkbox"
            checked={attach.layoutRef}
            disabled={!hasLayoutRef}
            onchange={() => toggle("layoutRef")}
            aria-describedby={!hasLayoutRef ? "no-layout-ref-hint" : undefined}
        />
        Attach Layout Reference
    </label>
    {#if !hasLayoutRef}
        <p id="no-layout-ref-hint" class="check-hint">
            No layout reference image uploaded.
        </p>
    {/if}

    {#if capabilities && currentImageCount(attach) >= capabilities.maxInputImages}
        <p class="cap-warning" role="alert">
            Max {capabilities.maxInputImages} input image{capabilities.maxInputImages !==
            1
                ? "s"
                : ""} for this model. Uncheck some to continue.
        </p>
    {/if}
</fieldset>

<style>
    .attach-checks {
        border: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .check-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        cursor: pointer;
        color: var(--clr-text-2);
    }
    .check-label.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .check-label input[type="checkbox"] {
        width: auto;
        cursor: inherit;
    }
    .check-hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0 0 0 22px;
    }
    .cap-warning {
        font-size: 0.75rem;
        color: var(--clr-danger);
        margin: 4px 0 0;
        font-weight: 500;
    }
</style>
