<script lang="ts">
    import ModelPicker from "./ModelPicker.svelte";
    import {
        boardState,
        createChain,
        createRootSketch
    } from "../lib/state/board.svelte";
    import { settings } from "../lib/state/settings.svelte";

    const { onCancel }: { onCancel: () => void } = $props();

    let modelId = $state<string | null>(
        boardState.board?.settings.defaultModelId ??
            settings.defaultModelId ??
            null
    );
    let prompt = $state("");
    let submitting = $state(false);

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!modelId || !prompt.trim()) return;
        submitting = true;
        try {
            const chain = await createChain(modelId);
            await createRootSketch(chain.id, prompt.trim(), modelId);
            onCancel();
        } finally {
            submitting = false;
        }
    }
</script>

<form class="composer card" onsubmit={submit} aria-label="New sketch">
    <h2 class="composer__title">New Sketch</h2>

    <div class="composer__model">
        <ModelPicker value={modelId} onSelect={(id) => (modelId = id)} />
    </div>

    <label for="root-prompt" class="composer__prompt-label">Prompt</label>
    <textarea
        id="root-prompt"
        bind:value={prompt}
        rows={3}
        placeholder="Describe what to generate…"
        required></textarea>

    <div class="composer__actions">
        <button
            type="submit"
            class="btn-primary"
            disabled={!modelId || !prompt.trim() || submitting}
        >
            {submitting ? "Creating…" : "Create Draft"}
        </button>
        <button type="button" class="btn-ghost" onclick={onCancel}
            >Cancel</button
        >
    </div>
</form>

<style>
    .composer {
        max-width: 720px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
    }
    .composer__title {
        font-size: 0.9375rem;
        font-weight: 700;
        margin: 0;
        color: var(--clr-text);
    }
    .composer__model {
        padding: 8px;
        background: var(--clr-bg);
        border-radius: 4px;
        border: 1px solid var(--clr-border-2);
    }
    .composer__prompt-label {
        font-weight: 600;
        font-size: 0.8125rem;
    }
    .composer__actions {
        display: flex;
        gap: 8px;
    }
</style>
