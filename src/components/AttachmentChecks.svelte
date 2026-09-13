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
        parentImageCount,
        onChange
    }: {
        attach: AttachFlags;
        capabilities: ModelCapabilities | undefined;
        hasStyleDoc: boolean;
        hasStyleRef: boolean;
        hasLayoutRef: boolean;
        isRefinement: boolean;
        parentImageCount: number;
        onChange: (flags: AttachFlags) => void;
    } = $props();

    const uid = $props.id();
    const noStyleDocHintId = `${uid}-no-style-doc-hint`;
    const noStyleRefHintId = `${uid}-no-style-ref-hint`;
    const noLayoutRefHintId = `${uid}-no-layout-ref-hint`;
    const noInputRefsHintId = `${uid}-no-input-refs-hint`;
    const parentInputCapHintId = `${uid}-parent-input-cap-hint`;
    const inputCapHintId = `${uid}-input-cap-hint`;

    function currentImageCount(flags: AttachFlags): number {
        let n = isRefinement ? parentImageCount : 0;
        if (flags.styleRef && hasStyleRef) n++;
        if (flags.layoutRef && hasLayoutRef) n++;
        return n;
    }

    function inputCapReached(): boolean {
        return (
            !!capabilities &&
            capabilities.maxInputImages > 0 &&
            currentImageCount(attach) >= capabilities.maxInputImages
        );
    }

    function parentExceedsInputCap(): boolean {
        return (
            !!capabilities &&
            isRefinement &&
            parentImageCount > capabilities.maxInputImages
        );
    }

    function parentFillsInputCap(): boolean {
        return (
            !!capabilities &&
            isRefinement &&
            capabilities.maxInputImages > 0 &&
            parentImageCount >= capabilities.maxInputImages
        );
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
            aria-describedby={!hasStyleDoc ? noStyleDocHintId : undefined}
        />
        Attach Style Description
    </label>
    {#if !hasStyleDoc}
        <p id={noStyleDocHintId} class="check-hint">
            No style guide set above.
        </p>
    {/if}

    <label
        class="check-label"
        class:disabled={!hasStyleRef ||
            ((capabilities?.maxInputImages === 0 || inputCapReached()) &&
                !attach.styleRef)}
    >
        <input
            type="checkbox"
            checked={attach.styleRef}
            disabled={!hasStyleRef ||
                ((capabilities?.maxInputImages === 0 || inputCapReached()) &&
                    !attach.styleRef)}
            onchange={() => toggle("styleRef")}
            aria-describedby={!hasStyleRef
                ? noStyleRefHintId
                : capabilities?.maxInputImages === 0
                  ? noInputRefsHintId
                  : parentExceedsInputCap()
                    ? parentInputCapHintId
                    : inputCapReached() && !attach.styleRef
                      ? inputCapHintId
                      : undefined}
        />
        Attach Style Reference
    </label>
    {#if !hasStyleRef}
        <p id={noStyleRefHintId} class="check-hint">
            No style reference image uploaded.
        </p>
    {/if}

    <label
        class="check-label"
        class:disabled={!hasLayoutRef ||
            ((capabilities?.maxInputImages === 0 || inputCapReached()) &&
                !attach.layoutRef)}
    >
        <input
            type="checkbox"
            checked={attach.layoutRef}
            disabled={!hasLayoutRef ||
                ((capabilities?.maxInputImages === 0 || inputCapReached()) &&
                    !attach.layoutRef)}
            onchange={() => toggle("layoutRef")}
            aria-describedby={!hasLayoutRef
                ? noLayoutRefHintId
                : capabilities?.maxInputImages === 0
                  ? noInputRefsHintId
                  : parentExceedsInputCap()
                    ? parentInputCapHintId
                    : inputCapReached() && !attach.layoutRef
                      ? inputCapHintId
                      : undefined}
        />
        Attach Layout Reference
    </label>
    {#if !hasLayoutRef}
        <p id={noLayoutRefHintId} class="check-hint">
            No layout reference image uploaded.
        </p>
    {/if}

    {#if capabilities && capabilities.maxInputImages === 0}
        <p id={noInputRefsHintId} class="cap-warning" role="status">
            This model does not accept reference images.
        </p>
    {:else if parentExceedsInputCap()}
        <p id={parentInputCapHintId} class="cap-warning" role="status">
            This result has {parentImageCount} outputs, but this model accepts at
            most {capabilities?.maxInputImages} reference images. Generate a single-output
            result or choose a model with a larger limit.
        </p>
    {:else if capabilities && currentImageCount(attach) < capabilities.minInputImages}
        <p class="cap-warning" role="status">
            This model requires at least {capabilities.minInputImages}
            reference image{capabilities.minInputImages !== 1 ? "s" : ""}.
        </p>
    {:else if capabilities && currentImageCount(attach) >= capabilities.maxInputImages}
        <p id={inputCapHintId} class="cap-warning" role="status">
            {#if parentFillsInputCap()}
                Parent outputs use all {capabilities.maxInputImages} available reference
                images. Uncheck an attached reference to replace one.
            {:else}
                Max {capabilities.maxInputImages} input image{capabilities.maxInputImages !==
                1
                    ? "s"
                    : ""} for this model. Uncheck some to continue.
            {/if}
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
