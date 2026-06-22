<script lang="ts">
    import { boardState, updateBoardSettings } from "../lib/state/board.svelte";

    function onSessionCapChange(e: Event) {
        const val = parseFloat((e.target as HTMLInputElement).value);
        const cap = isNaN(val) || val <= 0 ? null : val;
        void updateBoardSettings({ sessionCostCapUsd: cap });
    }
</script>

<div class="session-cap-section">
    <label for="session-cap" class="panel-label">Session cost cap ($)</label>
    <p class="panel-hint" id="cap-hint">
        Stop dispatching when total session cost exceeds this. Estimates may be
        inexact.
    </p>
    <input
        id="session-cap"
        type="number"
        min="0"
        step="0.01"
        placeholder="No cap"
        value={boardState.board?.settings.sessionCostCapUsd ?? ""}
        onblur={onSessionCapChange}
        class="cap-input"
        aria-describedby="cap-hint"
    />
    <p class="panel-hint">Leave blank for no limit.</p>
</div>

<style>
    .session-cap-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .panel-label {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 0.875rem;
        color: var(--clr-text);
    }
    .panel-hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0;
    }
    .cap-input {
        width: 120px;
        font-size: 0.875rem;
        padding: 4px 8px;
    }
</style>
