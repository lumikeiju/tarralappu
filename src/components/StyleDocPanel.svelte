<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import {
        boardState,
        updateBoardSettings,
        generateRandomStyleGuide,
        randomTextGeneration,
        getSessionBudgetUsed
    } from "../lib/state/board.svelte";
    import { auth } from "../lib/state/settings.svelte";
    import { humanizeError, rawErrorDetails } from "../lib/openrouter/client";
    import { formatUsd } from "../lib/openrouter/cost";

    const styleDoc = $derived(boardState.board?.settings.styleDoc ?? "");
    const cap = $derived(boardState.board?.settings.sessionCostCapUsd ?? null);
    const capReached = $derived(cap !== null && getSessionBudgetUsed() >= cap);

    let debounceTimer: ReturnType<typeof setTimeout>;
    let pendingStyleDoc: string | undefined;
    let controller: AbortController | undefined;
    let generating = $state(false);
    let budgetAcknowledged = $state(false);
    let error = $state("");
    let errorRaw = $state<string | null>(null);
    let status = $state("");
    let randomButton = $state<HTMLButtonElement>();
    let cancelButton = $state<HTMLButtonElement>();
    let styleInput = $state<HTMLTextAreaElement>();
    let budgetCheckbox = $state<HTMLInputElement>();
    let destroyed = false;

    function onInput(e: Event) {
        const val = (e.target as HTMLTextAreaElement).value;
        pendingStyleDoc = val;
        error = "";
        errorRaw = null;
        status = "";
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            pendingStyleDoc = undefined;
            void updateBoardSettings({ styleDoc: val }).catch(
                (cause: unknown) => {
                    error = humanizeError(cause);
                }
            );
        }, 400);
    }

    async function randomize() {
        if (generating) return;
        clearTimeout(debounceTimer);
        error = "";
        errorRaw = null;
        status = "";
        generating = true;
        controller = new AbortController();
        await tick();
        cancelButton?.focus();
        try {
            if (pendingStyleDoc !== undefined) {
                const value = pendingStyleDoc;
                pendingStyleDoc = undefined;
                await updateBoardSettings({ styleDoc: value });
            }
            const result = await generateRandomStyleGuide({
                signal: controller.signal,
                budgetAcknowledged
            });
            status =
                result.costUsd === null
                    ? "Random style guide saved. Cost unavailable; the session total may be incomplete."
                    : `Random style guide saved. Text-generation cost: ${formatUsd(result.costUsd)}.`;
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") {
                status =
                    "Random generation cancelled. Your style guide is unchanged. OpenRouter may still charge for processed tokens.";
            } else {
                error = humanizeError(cause);
                errorRaw = rawErrorDetails(cause);
            }
        } finally {
            const restoreFocus =
                !destroyed && document.activeElement === cancelButton;
            generating = false;
            budgetAcknowledged = false;
            controller = undefined;
            if (restoreFocus) {
                await tick();
                if (randomButton && !randomButton.disabled) {
                    randomButton.focus();
                } else if (budgetCheckbox && !budgetCheckbox.disabled) {
                    budgetCheckbox.focus();
                } else {
                    styleInput?.focus();
                }
            }
        }
    }

    onDestroy(() => {
        destroyed = true;
        clearTimeout(debounceTimer);
        controller?.abort();
    });
</script>

<section class="style-doc-panel" aria-label="Style document">
    <div class="style-doc-header">
        <label for="style-doc" class="panel-label">Style Guide</label>
        <div class="style-doc-actions">
            <button
                bind:this={randomButton}
                type="button"
                class="btn-ghost random-button"
                disabled={generating ||
                    randomTextGeneration.inProgress ||
                    !auth.apiKey ||
                    capReached ||
                    (cap !== null && !budgetAcknowledged)}
                onclick={randomize}
                aria-describedby="style-doc-random-hint"
                title="Generate a random style guide with DeepSeek Flash via OpenRouter (uses API credits)"
                >Random</button
            >
            {#if generating}
                <button
                    bind:this={cancelButton}
                    type="button"
                    class="btn-ghost"
                    onclick={() => controller?.abort()}>Cancel</button
                >
            {/if}
        </div>
    </div>
    <p class="panel-hint" id="style-doc-hint">
        Describe the visual style for all generations. Attached to sketches via
        the "Attach Style Description" checkbox.
    </p>
    <textarea
        bind:this={styleInput}
        id="style-doc"
        value={styleDoc}
        oninput={onInput}
        rows={6}
        placeholder="e.g. Warm colours, morning light, soft shadows…"
        aria-describedby="style-doc-hint"
        disabled={generating}
        spellcheck></textarea>
    <p class="panel-hint" id="style-doc-random-hint">
        Random uses DeepSeek Flash via OpenRouter and API credits.
        {#if !auth.apiKey}Connect an API key to enable it.{/if}
        {#if capReached}The session cost cap is reached.{/if}
        {#if randomTextGeneration.inProgress && !generating}
            Another Random request is running.
        {/if}
    </p>
    {#if cap !== null && !capReached}
        <label class="budget-acknowledgment">
            <input
                bind:this={budgetCheckbox}
                type="checkbox"
                bind:checked={budgetAcknowledged}
                disabled={generating}
            />
            I understand Random cannot be pre-estimated and may exceed this local
            cap.
        </label>
    {/if}
    {#if boardState.board?.styleGuideUnreportedCosts}
        <p class="panel-hint">
            Some style-guide costs are unavailable; the session total may be
            incomplete.
        </p>
    {/if}
    {#if generating}<p role="status">Generating a random style guide...</p>{/if}
    {#if status}<p role="status">{status}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if errorRaw}
        <details>
            <summary>Raw API response</summary>
            <pre>{errorRaw}</pre>
        </details>
    {/if}
</section>

<style>
    .style-doc-panel {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .panel-label {
        font-weight: 700;
        font-size: 0.875rem;
        color: var(--clr-text);
    }
    .style-doc-header,
    .style-doc-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .style-doc-header {
        justify-content: space-between;
        flex-wrap: wrap;
    }
    .random-button {
        min-height: 24px;
    }
    .budget-acknowledgment {
        display: flex;
        align-items: start;
        gap: 6px;
        font-size: 0.75rem;
    }
    .budget-acknowledgment input {
        width: auto;
        flex-shrink: 0;
    }
    .error {
        color: var(--clr-danger);
        overflow-wrap: anywhere;
    }
    pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 0.75rem;
    }
    .panel-hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0;
    }
</style>
