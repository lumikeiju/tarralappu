<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import {
        boardState,
        addPromptNote,
        updatePromptNote,
        removePromptNote,
        sendPromptsToModels,
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
    let generatingNoteId = $state<string | null>(null);
    let selectedNoteIds = $state(new Set<string>());
    let sendingPrompts = $state(false);
    let sendStatus = $state("");
    let sendError = $state("");
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
                signal: controller.signal
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
            controller = undefined;
            if (restoreFocus) {
                await tick();
                const button = document.getElementById(`prompt-random-${id}`);
                if (button instanceof HTMLButtonElement && !button.disabled) {
                    button.focus();
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
        const nextSelection = new Set(selectedNoteIds);
        nextSelection.delete(id);
        selectedNoteIds = nextSelection;
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
        if (field === "text" && !value.trim()) {
            const nextSelection = new Set(selectedNoteIds);
            nextSelection.delete(id);
            selectedNoteIds = nextSelection;
        }
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

    const selectedNotes = $derived(
        notes.filter((note) => selectedNoteIds.has(note.id) && note.text.trim())
    );
    let sendDialogNoteIds = $state<string[]>([]);
    let sendDialogIsBulk = $state(false);
    const sendDialogNotes = $derived(
        sendDialogNoteIds
            .map((id) => notes.find((note) => note.id === id))
            .filter((note): note is PromptNote => Boolean(note?.text.trim()))
    );

    function openSendDialog(id: string) {
        sendDialogNoteIds = [id];
        sendDialogIsBulk = false;
        sendError = "";
        sendStatus = "";
    }
    function openSelectedSendDialog() {
        if (selectedNotes.length === 0 || sendingPrompts) return;
        sendDialogNoteIds = selectedNotes.map((note) => note.id);
        sendDialogIsBulk = true;
        sendError = "";
        sendStatus = "";
    }
    function closeSendDialog() {
        sendDialogNoteIds = [];
        sendDialogIsBulk = false;
    }
    function handleSend(modelIds: string[]) {
        const promptEntries = sendDialogNotes.map((note) => ({
            id: note.id,
            text: pendingEdits.get(note.id)?.text ?? note.text
        }));
        const noteIds = promptEntries.map((entry) => entry.id);
        const prompts = promptEntries
            .map((entry) => entry.text)
            .filter((text) => text.trim());
        const wasBulk = sendDialogIsBulk;
        if (prompts.length === 0 || modelIds.length === 0) return;

        sendingPrompts = true;
        sendError = "";
        sendStatus = "";
        void (async () => {
            try {
                for (const id of noteIds) await flushNote(id);
                await sendPromptsToModels(prompts, modelIds);
                const draftCount = prompts.length * modelIds.length;
                sendStatus = `Created ${draftCount} prompt draft${draftCount === 1 ? "" : "s"}.`;
                if (wasBulk) selectedNoteIds = new Set();
            } catch (cause) {
                sendError = `${humanizeError(cause)} Some drafts may already have been created.`;
            } finally {
                sendingPrompts = false;
            }
        })();
        closeSendDialog();
    }

    function togglePromptSelection(id: string) {
        const next = new Set(selectedNoteIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selectedNoteIds = next;
        sendError = "";
        sendStatus = "";
    }

    onDestroy(() => {
        destroyed = true;
        for (const timer of debounceTimers.values()) clearTimeout(timer);
        clearTimeout(copyResetTimer);
        controller?.abort();
    });
</script>

{#if selectedNotes.length > 0}
    <div
        class="prompt-board-selection"
        role="group"
        aria-label="Selected prompts"
    >
        <span aria-live="polite">
            {selectedNotes.length} prompt{selectedNotes.length === 1 ? "" : "s"} selected
        </span>
        <div class="prompt-board-selection__actions">
            <button
                class="btn-primary"
                type="button"
                onclick={openSelectedSendDialog}
                disabled={sendingPrompts}
            >
                Send to…
            </button>
            <button
                class="btn-ghost"
                type="button"
                onclick={() => (selectedNoteIds = new Set())}
                disabled={sendingPrompts}
            >
                Clear selection
            </button>
        </div>
    </div>
{/if}
{#if sendStatus}
    <p class="prompt-send-status" role="status">{sendStatus}</p>
{/if}
{#if sendError}
    <p class="prompt-note__error" role="alert">{sendError}</p>
{/if}

<div class="prompt-board" role="list" aria-label="Prompt board notes">
    {#each notes as note (note.id)}
        <div
            class="prompt-note card"
            role="listitem"
            style="--note-rotation: {noteRotation(note.id)}deg"
        >
            <div class="prompt-note__actions">
                <input
                    class="prompt-note__select"
                    type="checkbox"
                    checked={selectedNoteIds.has(note.id)}
                    onchange={() => togglePromptSelection(note.id)}
                    aria-label="Select prompt {note.name || 'without a name'}"
                    disabled={sendingPrompts ||
                        generatingNoteId === note.id ||
                        !note.text.trim()}
                />
                <button
                    id="prompt-random-{note.id}"
                    class="btn-ghost prompt-note__random"
                    type="button"
                    onclick={() => randomize(note.id)}
                    aria-label="Random prompt for this note"
                    aria-describedby="prompt-random-hint"
                    title="Generate a random image prompt with DeepSeek Flash via OpenRouter (uses API credits)"
                    disabled={sendingPrompts ||
                        generatingNoteId !== null ||
                        randomTextGeneration.inProgress ||
                        !auth.apiKey ||
                        capReached}>Random</button
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
                    disabled={sendingPrompts ||
                        !note.text ||
                        generatingNoteId === note.id}
                >
                    {copiedId === note.id ? "✓" : "⧉"}
                </button>
                <button
                    class="btn-icon"
                    onclick={() => openSendDialog(note.id)}
                    aria-label="Send this prompt to one or more models"
                    title="Send to…"
                    disabled={sendingPrompts ||
                        !note.text ||
                        generatingNoteId === note.id}
                >
                    ➤
                </button>
                <button
                    class="btn-icon prompt-note__remove"
                    onclick={() => removeNote(note.id)}
                    aria-label="Remove this prompt note"
                    title="Remove"
                    disabled={sendingPrompts || generatingNoteId === note.id}
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
                disabled={sendingPrompts || generatingNoteId === note.id}
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
                disabled={sendingPrompts || generatingNoteId === note.id}
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
{#if boardState.board?.randomPromptUnreportedCosts}
    <p class="prompt-random-hint">
        Some random-prompt costs are unavailable; the session total may be
        incomplete.
    </p>
{/if}

<SendToDialog
    open={sendDialogNotes.length > 0}
    promptPreview={sendDialogNotes.length === 1
        ? sendDialogNotes[0].text
        : `${sendDialogNotes.length} prompts selected. Drafts will be created for each selected prompt and model.`}
    promptCount={sendDialogNotes.length}
    onClose={closeSendDialog}
    onSend={handleSend}
/>

<style>
    .prompt-board-selection {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
        padding: 4px 4px 0;
        font-size: 0.8125rem;
        color: var(--clr-text-2);
    }
    .prompt-board-selection__actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .prompt-board-selection__actions button {
        min-height: 30px;
    }
    .prompt-send-status {
        padding: 4px;
        font-size: 0.75rem;
        color: var(--clr-success);
    }
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
    .prompt-note__select {
        flex: 0 0 auto;
        width: 24px;
        height: 24px;
        accent-color: var(--clr-accent);
    }
    .prompt-note__random:focus-visible,
    .prompt-note__cancel:focus-visible {
        outline-color: currentColor;
    }
    .prompt-random-hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
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
