<script lang="ts">
    import {
        boardState,
        addPromptNote,
        updatePromptNote,
        removePromptNote,
        sendPromptToModels
    } from "../lib/state/board.svelte";
    import SendToDialog from "./SendToDialog.svelte";

    const notes = $derived(boardState.board?.settings.promptNotes ?? []);

    // Deterministic per-note rotation from its id (stable, no Math.random).
    function noteRotation(id: string): number {
        let h = 5381;
        for (let i = 0; i < id.length; i++) {
            h = (((h << 5) + h) ^ id.charCodeAt(i)) >>> 0;
        }
        return ((h % 15) - 7) * 0.14; // range ≈ [-0.98, 0.98] deg
    }

    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    function onNoteInput(id: string, field: "name" | "text", value: string) {
        const timerKey = `${id}:${field}`;
        clearTimeout(debounceTimers.get(timerKey));
        debounceTimers.set(
            timerKey,
            setTimeout(() => {
                void updatePromptNote(id, { [field]: value });
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
                    class="btn-icon"
                    onclick={() => copyNote(note.id, note.text)}
                    aria-label={copiedId === note.id
                        ? "Copied"
                        : "Copy prompt text"}
                    title="Copy"
                    disabled={!note.text}
                >
                    {copiedId === note.id ? "✓" : "⧉"}
                </button>
                <button
                    class="btn-icon"
                    onclick={() => openSendDialog(note.id)}
                    aria-label="Send this prompt to one or more models"
                    title="Send to…"
                    disabled={!note.text}
                >
                    ➤
                </button>
                <button
                    class="btn-icon prompt-note__remove"
                    onclick={() => removePromptNote(note.id)}
                    aria-label="Remove this prompt note"
                    title="Remove"
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
                placeholder="Jot a prompt to reuse later…"></textarea>
        </div>
    {/each}

    <div class="prompt-note-add-wrap" role="listitem">
        <button
            class="prompt-note-add"
            onclick={onAdd}
            aria-label="Add a new prompt note"
        >
            <span class="prompt-note-add__plus" aria-hidden="true">+</span>
            <span>Add Note</span>
        </button>
    </div>
</div>

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
        justify-content: flex-end;
        gap: 4px;
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
        border: 1px solid var(--note-edge, var(--clr-border-2));
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
