<script lang="ts">
    import {
        boardState,
        loadAvailableModels,
        togglePinnedModel
    } from "../lib/state/board.svelte";
    import { formatModelPricing, pricingTier } from "../lib/openrouter/cost";
    import {
        groupModelsByCreator,
        getPinnedModels,
        modelNameForCreator
    } from "../lib/openrouter/modelGroups";
    import type { ModelCapabilities } from "../lib/openrouter/types";
    import { humanizeError } from "../lib/openrouter/client";

    const {
        open,
        promptPreview,
        promptCount = 1,
        onClose,
        onSend
    }: {
        open: boolean;
        promptPreview: string;
        promptCount?: number;
        onClose: () => void;
        onSend: (modelIds: string[]) => void;
    } = $props();

    let dialogEl: HTMLDialogElement | undefined = $state();
    let filter = $state("");
    let selected = $state(new Set<string>());
    let pinError = $state("");

    $effect(() => {
        if (!dialogEl) return;
        if (open && !dialogEl.open) {
            // Reset selection/filter each time the dialog is (re)opened.
            selected = new Set();
            filter = "";
            pinError = "";
            dialogEl.showModal();
        } else if (!open && dialogEl.open) {
            dialogEl.close();
        }
    });

    function onNativeClose() {
        onClose();
    }

    // Close when clicking the backdrop area (the inner wrapper, not a child element)
    function onBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }

    const groups = $derived(
        groupModelsByCreator(boardState.availableModels, filter)
    );
    const pinnedModels = $derived(
        getPinnedModels(
            boardState.availableModels,
            boardState.board?.settings.pinnedModelIds ?? [],
            filter
        )
    );

    function isPinned(id: string): boolean {
        return (boardState.board?.settings.pinnedModelIds ?? []).includes(id);
    }

    async function toggleModelPin(id: string) {
        pinError = "";
        try {
            await togglePinnedModel(id);
        } catch (cause) {
            pinError = humanizeError(cause);
        }
    }

    function toggle(id: string) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selected = next;
    }

    function clearSelection() {
        selected = new Set();
    }

    function handleConfirm() {
        if (selected.size === 0) return;
        onSend([...selected]);
        onClose();
    }
</script>

{#snippet modelOption(m: ModelCapabilities, displayName: string)}
    {@const tier = pricingTier(m.pricing, m.id)}
    <div class="model-option">
        <label class="model-choice">
            <input
                type="checkbox"
                checked={selected.has(m.id)}
                onchange={() => toggle(m.id)}
            />
            <span class="model-name" title={m.id}>{displayName}</span>
            {#if tier}
                <span
                    class="price-tier"
                    data-tier={tier}
                    title="Relative cost tier: {tier}"
                >
                    {tier}
                </span>
            {/if}
            <span class="model-price"
                >{formatModelPricing(m.pricing, m.id) ??
                    "pricing not listed"}</span
            >
        </label>
        <button
            type="button"
            class="pin-btn"
            class:pinned={isPinned(m.id)}
            aria-pressed={isPinned(m.id)}
            aria-label="Pin {m.name}"
            title={isPinned(m.id) ? "Unpin model" : "Pin model"}
            disabled={boardState.modelsLoading}
            onclick={() => toggleModelPin(m.id)}
        >
            <span aria-hidden="true">{isPinned(m.id) ? "★" : "☆"}</span>
        </button>
    </div>
{/snippet}

<dialog
    bind:this={dialogEl}
    class="send-to-dialog"
    aria-labelledby="send-to-title"
    onclose={onNativeClose}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="send-to-dialog__inner"
        role="presentation"
        onclick={onBackdropClick}
    >
        <div class="send-to-panel card">
            <div class="send-to-header">
                <h2 id="send-to-title">
                    Send {promptCount > 1 ? `${promptCount} Prompts` : "Prompt"} to
                    Models
                </h2>
                <button
                    class="btn-icon"
                    onclick={onClose}
                    aria-label="Close send-to-models dialog"
                >
                    ✕
                </button>
            </div>

            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <p
                class="send-to-preview"
                role="region"
                aria-label={promptCount > 1
                    ? "Selected prompts"
                    : "Prompt preview"}
                tabindex="0"
            >
                “{promptPreview}”
            </p>

            <div class="send-to-toolbar">
                <input
                    type="text"
                    bind:value={filter}
                    placeholder="Filter models…"
                    aria-label="Filter model list"
                />
                <button class="btn-ghost" onclick={clearSelection}>Clear</button
                >
            </div>

            <div class="model-groups">
                {#if pinnedModels.length > 0}
                    <fieldset class="creator-group pinned-group">
                        <legend>PINNED</legend>
                        {#each pinnedModels as m (m.id)}
                            {@render modelOption(m, m.name)}
                        {/each}
                    </fieldset>
                    {#if groups.length > 0}
                        <hr class="group-sep" />
                    {/if}
                {/if}
                {#each groups as group, i (group.key)}
                    {#if i > 0}
                        <hr class="group-sep" />
                    {/if}
                    <fieldset class="creator-group">
                        <legend>{group.label}</legend>
                        {#each group.models as m (m.id)}
                            {@render modelOption(
                                m,
                                modelNameForCreator(m.name, group.label)
                            )}
                        {/each}
                    </fieldset>
                {/each}
                {#if groups.length === 0}
                    <p class="no-results">
                        {boardState.modelsLoading
                            ? "Loading models…"
                            : `No models match "${filter}".`}
                    </p>
                {/if}
            </div>

            {#if pinError}<p class="pin-error" role="alert">{pinError}</p>{/if}

            {#if boardState.modelsError}
                <button class="btn-ghost" onclick={loadAvailableModels}
                    >Retry loading models</button
                >
            {/if}

            <div class="send-to-footer">
                <span class="send-to-count" aria-live="polite">
                    {selected.size === 0
                        ? "No models selected"
                        : `${selected.size} model${selected.size === 1 ? "" : "s"} selected`}
                </span>
                <div class="send-to-actions">
                    <button class="btn-ghost" onclick={onClose}>Cancel</button>
                    <button
                        class="btn-primary"
                        onclick={handleConfirm}
                        disabled={selected.size === 0}
                    >
                        {promptCount > 1
                            ? `Create ${promptCount * selected.size} drafts`
                            : `Send to ${selected.size} ${selected.size === 1 ? "model" : "models"}`}
                    </button>
                </div>
            </div>
        </div>
    </div>
</dialog>

<style>
    .send-to-dialog {
        background: transparent;
        border: none;
        padding: 0;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        overflow: hidden;
        /*
         * Do NOT set display here — this element is a <dialog>.
         * The UA applies display:none for closed dialogs; any author
         * display value would override that and show all dialogs on load.
         * Centering is handled by the inner wrapper div instead.
         */
    }
    .send-to-dialog__inner {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 20px;
    }
    /* ::backdrop doesn't inherit the Svelte scope attribute — use :global */
    :global(.send-to-dialog::backdrop) {
        background: rgba(0, 0, 0, 0.55);
    }

    .send-to-panel {
        width: 100%;
        max-width: 760px;
        max-height: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 18px;
        overflow: hidden;
    }
    .send-to-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-shrink: 0;
    }
    .send-to-header h2 {
        font-size: 1rem;
        font-weight: 700;
        margin: 0;
        color: var(--clr-text);
    }
    .send-to-preview {
        width: 100%;
        flex-shrink: 0;
        font-size: 0.8125rem;
        font-style: italic;
        color: var(--clr-text-2);
        margin: 0;
        white-space: normal;
        overflow-wrap: anywhere;
        max-height: 6em;
        overflow-y: auto;
        line-height: 1.5;
    }
    .send-to-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }
    .send-to-toolbar input {
        flex: 1;
        font-size: 0.8125rem;
        padding: 4px 8px;
    }
    .send-to-toolbar .btn-ghost {
        font-size: 0.75rem;
        padding: 2px 8px;
        white-space: nowrap;
    }

    .model-groups {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-height: 120px;
        overflow-y: auto;
        border: 1px solid var(--clr-border);
        border-radius: 4px;
        padding: 8px 10px;
        background: var(--clr-surface-2);
    }
    .group-sep {
        border: none;
        border-top: 1px solid var(--clr-border);
        margin: 4px 0;
        width: 100%;
    }
    .creator-group {
        border: none;
        padding: 0;
        margin: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .creator-group legend {
        font-size: 0.6875rem;
        font-weight: 700;
        font-family: var(--font-display);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--clr-text-3);
        padding: 0;
        margin-bottom: 2px;
    }
    .model-option {
        display: flex;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
        width: 100%;
        font-size: 0.8125rem;
        color: var(--clr-text);
        cursor: pointer;
        padding: 3px 2px;
        border-radius: 3px;
    }
    .model-option:hover {
        background: var(--clr-surface);
    }
    .model-choice {
        display: flex;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
        flex: 1;
        cursor: pointer;
        color: inherit;
    }
    .pin-btn {
        flex: 0 0 auto;
        min-width: 24px;
        min-height: 24px;
        padding: 2px 4px;
        border: none;
        background: transparent;
        color: var(--clr-text-3);
        font-size: 1rem;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .pin-btn:hover:not(:disabled),
    .pin-btn.pinned {
        color: var(--clr-accent);
    }
    .pin-btn:focus-visible {
        outline: 2px solid transparent;
        box-shadow: var(--focus-ring);
    }
    .pin-error {
        color: var(--clr-danger);
        font-size: 0.8125rem;
        overflow-wrap: anywhere;
    }
    .model-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .price-tier {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        font-size: 0.6875rem;
        font-weight: 700;
        font-family: var(--font-display);
        letter-spacing: 0.02em;
        padding: 1px 6px;
        border-radius: 10px;
        background: var(--clr-success-bg);
        color: var(--clr-success);
    }
    .price-tier[data-tier="$$"] {
        background: var(--clr-warning-bg);
        color: var(--clr-warning);
    }
    .price-tier[data-tier="$$$"] {
        background: var(--clr-danger-bg);
        color: var(--clr-danger);
    }
    .model-price {
        font-size: 0.6875rem;
        color: var(--clr-text-3);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .no-results {
        font-size: 0.8125rem;
        color: var(--clr-text-3);
        margin: 0;
        padding: 4px 2px;
    }

    .send-to-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        flex-shrink: 0;
    }
    .send-to-count {
        font-size: 0.75rem;
        color: var(--clr-text-3);
    }
    .send-to-actions {
        display: flex;
        gap: 8px;
    }

    @media (prefers-reduced-motion: no-preference) {
        :global(.send-to-dialog::backdrop) {
            animation: send-to-bd-in 0.18s ease;
        }
    }
    @keyframes send-to-bd-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
</style>
