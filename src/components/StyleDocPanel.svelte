<script lang="ts">
    import { boardState, updateBoardSettings } from "../lib/state/board.svelte";

    const styleDoc = $derived(boardState.board?.settings.styleDoc ?? "");

    let debounceTimer: ReturnType<typeof setTimeout>;

    function onInput(e: Event) {
        const val = (e.target as HTMLTextAreaElement).value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            void updateBoardSettings({ styleDoc: val });
        }, 400);
    }
</script>

<section class="style-doc-panel" aria-label="Style document">
    <label for="style-doc" class="panel-label">Style Guide</label>
    <p class="panel-hint" id="style-doc-hint">
        Describe the visual style for all generations. Attached to sketches via
        the "Attach Style Description" checkbox.
    </p>
    <textarea
        id="style-doc"
        value={styleDoc}
        oninput={onInput}
        rows={6}
        placeholder="e.g. Studio Ghibli watercolour palette, warm morning light, soft shadows…"
        aria-describedby="style-doc-hint"
        spellcheck></textarea>
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
    .panel-hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0;
    }
</style>
