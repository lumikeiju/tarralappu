<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import {
        boardState,
        addPromptNote,
        updatePromptNote,
        removePromptNote,
        sendPromptToModels,
        generateRandomPrompt,
        getSessionBudgetUsed,
        randomTextGeneration
    } from "../lib/state/board.svelte";
    import type { PromptNote } from "../lib/db/schema";
    import { auth } from "../lib/state/settings.svelte";
    import { humanizeError, rawErrorDetails } from "../lib/openrouter/client";
    import { formatUsd } from "../lib/openrouter/cost";
    import SendToDialog from "./SendToDialog.svelte";

    const notes = $derived(boardState.board?.settings.promptNotes ?? []);
    const cap = $derived(boardState.board?.settings.sessionCostCapUsd ?? null);
    const capReached = $derived(cap !== null && getSessionBudgetUsed() >= cap);

    // Deterministic per-note rotation from its id (stable, no Math.random).
    function noteRotation(id: string): number {
        let h = 5381;
        for (let i = 0; i < id.length; i++) {
            h = (((h << 5) + h) ^ id.charCodeAt(i)) >>> 0;
        }
        return ((h % 15) - 7) * 0.14; // range ≈ [-0.98, 0.98] deg
    }

    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const pendingEdits = new Map<
        string,
        Partial<Pick<PromptNote, "name" | "text">>
    >();
    let addNoteButton = $state<HTMLButtonElement>();
    let cancelButton = $state<HTMLButtonElement>();
    let budgetCheckbox = $state<HTMLInputElement>();
    let generatingNoteId = $state<string | null>(null);
    let budgetAcknowledged = $state(false);
    let feedback = $state<{
        noteId: string;
        status: string;
        error: string;
        errorRaw: string | null;
    } | null>(null);
    let controller: AbortController | undefined;
    let destroyed = false;

    function reportError(id: string, cause: unknown) {
        feedback = {
            noteId: id,
            status: "",
            error: humanizeError(cause),
            errorRaw: rawErrorDetails(cause)
        };
    }

    async function flushNote(id: string) {
        clearTimeout(debounceTimers.get(id));
        debounceTimers.delete(id);
        const edits = pendingEdits.get(id);
        if (!edits) return;
        await updatePromptNote(id, edits);
        if (pendingEdits.get(id) === edits) pendingEdits.delete(id);
    }

    async function randomize(id: string) {
        if (generatingNoteId !== null) return;
        clearTimeout(debounceTimers.get(id));
        feedback = null;
        generatingNoteId = id;
        controller = new AbortController();
        await tick();
        cancelButton?.focus();
        try {
            await flushNote(id);
            const result = await generateRandomPrompt(id, {
                signal: controller.signal,
                budgetAcknowledged
            });
            feedback = {
                noteId: id,
                status:
                    result.costUsd === null
                        ? "Random prompt saved. Cost unavailable; the session total may be incomplete."
                        : `Random prompt saved. Text-generation cost: ${formatUsd(result.costUsd)}.`,
                error: "",
                errorRaw: null
            };
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") {
                feedback = {
                    noteId: id,
                    status: "Random generation cancelled. Your prompt is unchanged. OpenRouter may still charge for processed tokens.",
                    error: "",
                    errorRaw: null
                };
            } else {
                reportError(id, cause);
            }
        } finally {
            const restoreFocus =
                !destroyed && document.activeElement === cancelButton;
            generatingNoteId = null;
            budgetAcknowledged = false;
            controller = undefined;
            if (restoreFocus) {
                await tick();
                const button = document.getElementById(`prompt-random-${id}`);
                if (button instanceof HTMLButtonElement && !button.disabled) {
                    button.focus();
                } else if (budgetCheckbox && !budgetCheckbox.disabled) {
                    budgetCheckbox.focus();
                } else {
                    document.getElementById(`prompt-note-${id}`)?.focus();
                }
            }
        }
    }

    async function removeNote(id: string) {
        clearTimeout(debounceTimers.get(id));
        debounceTimers.delete(id);
        pendingEdits.delete(id);
        const index = notes.findIndex((note) => note.id === id);
        await removePromptNote(id);
        await tick();
        const nextNote = notes[index] ?? notes[index - 1];
        if (nextNote) {
            document.getElementById(`prompt-note-${nextNote.id}`)?.focus();
        } else {
            addNoteButton?.focus();
        }
    }

    function onNoteInput(id: string, field: "name" | "text", value: string) {
        if (feedback?.noteId === id) feedback = null;
        pendingEdits.set(id, { ...pendingEdits.get(id), [field]: value });
        clearTimeout(debounceTimers.get(id));
        debounceTimers.set(
            id,
            setTimeout(() => {
                void flushNote(id).catch((cause: unknown) =>
                    reportError(id, cause)
                );
            }, 400)
        );
    }

    let copiedId = $state<string | null>(null);
    let copyResetTimer: ReturnType<typeof setTimeout>;

    async function copyNote(id: string, text: string) {
        await navigator.clipboard.writeText(text);
        copiedId = id;
        clearTimeout(copyResetTimer);
        copyResetTimer = setTimeout(() => {
            copiedId = null;
        }, 1200);
    }

    function onAdd() {
        void addPromptNote();
    }

    // "Send to" dialog: which note (if any) is currently being sent.
    let sendDialogNoteId = $state<string | null>(null);
    const sendDialogNote = $derived(
        notes.find((n) => n.id === sendDialogNoteId) ?? null
    );

    function openSendDialog(id: string) {
        sendDialogNoteId = id;
    }
    function closeSendDialog() {
        sendDialogNoteId = null;
    }
    function handleSend(modelIds: string[]) {
        if (!sendDialogNote) return;
        void sendPromptToModels(sendDialogNote.text, modelIds);
    }

    onDestroy(() => {
        destroyed = true;
        for (const timer of debounceTimers.values()) clearTimeout(timer);
        clearTimeout(copyResetTimer);
        controller?.abort();
    });
</script>

<div class="prompt-board" role="list" aria-label="Prompt board notes">
    {#each notes as note (note.id)}
        <div
            class="prompt-note card"
            role="listitem"
            style="--note-rotation: {noteRotation(note.id)}deg"
        >
            <div class="prompt-note__actions">
                <button
                    id="prompt-random-{note.id}"
                    class="btn-ghost prompt-note__random"
                    type="button"
                    onclick={() => randomize(note.id)}
                    aria-label="Random prompt for this note"
                    aria-describedby="prompt-random-hint"
                    title="Generate a random image prompt with DeepSeek Flash via OpenRouter (uses API credits)"
                    disabled={generatingNoteId !== null ||
                        randomTextGeneration.inProgress ||
                        !auth.apiKey ||
                        capReached ||
                        (cap !== null && !budgetAcknowledged)}>Random</button
                >
                {#if generatingNoteId === note.id}
                    <button
                        bind:this={cancelButton}
                        class="btn-ghost prompt-note__cancel"
                        type="button"
                        onclick={() => controller?.abort()}
                        aria-label="Cancel random prompt generation"
                        >Cancel</button
                    >
                {/if}
                <button
                    class="btn-icon"
                    onclick={() => copyNote(note.id, note.text)}
                    aria-label={copiedId === note.id
                        ? "Copied"
                        : "Copy prompt text"}
                    title="Copy"
                    disabled={!note.text || generatingNoteId === note.id}
                >
                    {copiedId === note.id ? "✓" : "⧉"}
                </button>
                <button
                    class="btn-icon"
                    onclick={() => openSendDialog(note.id)}
                    aria-label="Send this prompt to one or more models"
                    title="Send to…"
                    disabled={!note.text || generatingNoteId === note.id}
                >
                    ➤
                </button>
                <button
                    class="btn-icon prompt-note__remove"
                    onclick={() => removeNote(note.id)}
                    aria-label="Remove this prompt note"
                    title="Remove"
                    disabled={generatingNoteId === note.id}
                >
                    ✕
                </button>
            </div>
            <label class="sr-only" for="prompt-note-name-{note.id}"
                >Prompt note name</label
            >
            <input
                class="prompt-note__name"
                id="prompt-note-name-{note.id}"
                value={note.name ?? ""}
                oninput={(e) =>
                    onNoteInput(
                        note.id,
                        "name",
                        (e.target as HTMLInputElement).value
                    )}
                placeholder="Name this prompt…"
                type="text"
                disabled={generatingNoteId === note.id}
            />
            <label class="sr-only" for="prompt-note-{note.id}"
                >Prompt note text</label
            >
            <textarea
                id="prompt-note-{note.id}"
                value={note.text}
                oninput={(e) =>
                    onNoteInput(
                        note.id,
                        "text",
                        (e.target as HTMLTextAreaElement).value
                    )}
                rows={5}
                disabled={generatingNoteId === note.id}
                placeholder="Jot a prompt to reuse later…"></textarea>
            {#if generatingNoteId === note.id}
                <p class="prompt-random-hint" role="status">
                    Generating a random image prompt...
                </p>
            {/if}
            {#if feedback && feedback.noteId === note.id}
                {#if feedback.status}
                    <p class="prompt-random-hint" role="status">
                        {feedback.status}
                    </p>
                {/if}
                {#if feedback.error}
                    <p class="prompt-note__error" role="alert">
                        {feedback.error}
                    </p>
                {/if}
                {#if feedback.errorRaw}
                    <details>
                        <summary>Raw API response</summary>
                        <pre>{feedback.errorRaw}</pre>
                    </details>
                {/if}
            {/if}
        </div>
    {/each}

    <div class="prompt-note-add-wrap" role="listitem">
        <button
            class="prompt-note-add"
            bind:this={addNoteButton}
            onclick={onAdd}
            aria-label="Add a new prompt note"
        >
            <span class="prompt-note-add__plus" aria-hidden="true">+</span>
            <span>Add Note</span>
        </button>
    </div>
</div>

<p class="prompt-random-hint" id="prompt-random-hint">
    Random replaces a note's text using DeepSeek Flash via OpenRouter and API
    credits.
    {#if !auth.apiKey}Connect an API key to enable it.{/if}
    {#if capReached}The session cost cap is reached.{/if}
    {#if randomTextGeneration.inProgress && generatingNoteId === null}
        Another Random request is running.
    {/if}
</p>
{#if cap !== null && !capReached}
    <label class="budget-acknowledgment">
        <input
            bind:this={budgetCheckbox}
            type="checkbox"
            bind:checked={budgetAcknowledged}
            disabled={generatingNoteId !== null ||
                randomTextGeneration.inProgress}
        />
        I understand random prompts cannot be pre-estimated and may exceed this local
        cap.
    </label>
{/if}
{#if boardState.board?.randomPromptUnreportedCosts}
    <p class="prompt-random-hint">
        Some random-prompt costs are unavailable; the session total may be
        incomplete.
    </p>
{/if}

<SendToDialog
    open={sendDialogNote !== null}
    promptPreview={sendDialogNote?.text ?? ""}
    onClose={closeSendDialog}
    onSend={handleSend}
/>

<style>
    .prompt-board {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 20px;
        overflow-x: auto;
        padding: 16px 4px 12px;
    }
    .prompt-note {
        flex-shrink: 0;
        width: 260px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .prompt-note__actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 4px;
    }
    .prompt-note__random,
    .prompt-note__cancel {
        min-height: 24px;
        padding: 0 6px;
        font-size: 0.75rem;
    }
    .prompt-note__random {
        margin-right: auto;
    }
    .prompt-note__random:focus-visible,
    .prompt-note__cancel:focus-visible {
        outline-color: currentColor;
    }
    .prompt-random-hint,
    .budget-acknowledgment {
        font-size: 0.75rem;
        color: var(--clr-text-3);
    }
    .budget-acknowledgment {
        display: flex;
        align-items: start;
        gap: 6px;
    }
    .budget-acknowledgment input {
        width: auto;
        flex-shrink: 0;
    }
    .prompt-note__error {
        font-size: 0.75rem;
        color: var(--clr-danger);
        overflow-wrap: anywhere;
    }
    pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 0.75rem;
    }
    .prompt-note__remove {
        color: var(--clr-danger);
    }
    .prompt-note__name {
        width: 100%;
        font-weight: 700;
        background: transparent;
        border: 1px solid var(--clr-text-2);
    }
    .prompt-note textarea {
        width: 100%;
        min-height: 140px;
        font-size: 0.8125rem;
        resize: vertical;
        background: transparent;
        border: 1px solid var(--clr-input-border);
    }
    .prompt-note-add-wrap {
        flex-shrink: 0;
        padding-top: 16px;
    }
    .prompt-note-add {
        width: 260px;
        min-height: 190px;
        border: 2px dashed var(--clr-border);
        border-radius: var(--card-radius);
        background: transparent;
        color: var(--clr-text-3);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
        transition:
            border-color 0.15s,
            color 0.15s;
    }
    .prompt-note-add:hover {
        border-color: var(--clr-accent);
        color: var(--clr-accent);
    }
    .prompt-note-add__plus {
        font-size: 1.5rem;
        line-height: 1;
        font-weight: 300;
    }
</style>
