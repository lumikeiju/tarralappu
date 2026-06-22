<script lang="ts">
    import { getSessionCostTotal } from "../lib/state/board.svelte";
    import { boardState } from "../lib/state/board.svelte";
    import { formatUsd } from "../lib/openrouter/cost";

    const cap = $derived(boardState.board?.settings.sessionCostCapUsd ?? null);
    const total = $derived(getSessionCostTotal());
    const pct = $derived(
        cap !== null && cap > 0 ? Math.min(1, total / cap) * 100 : 0
    );
    const nearCap = $derived(cap !== null && pct >= 80);
</script>

<div class="cost-meter" aria-label="Session cost">
    <span class="cost-label">Session</span>
    <span class="cost-value" class:near-cap={nearCap}>
        {formatUsd(total)}
        {#if cap !== null}
            <span class="cost-cap">/ {formatUsd(cap)}</span>
        {/if}
    </span>
    {#if cap !== null}
        <div
            class="cost-bar"
            role="progressbar"
            aria-label="Session cost progress"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext="{formatUsd(total)} of {formatUsd(cap ?? 0)}"
        >
            <div
                class="cost-bar__fill"
                class:near-cap={nearCap}
                style="width: {pct}%"
            ></div>
        </div>
    {/if}
</div>

<style>
    .cost-meter {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--clr-text-2);
    }
    .cost-label {
        color: var(--clr-text-3);
        font-weight: 500;
        font-family: var(--font-display);
        letter-spacing: 0.03em;
        font-size: 0.75rem;
        text-transform: uppercase;
    }
    .cost-value {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--clr-text);
    }
    .cost-value.near-cap {
        color: var(--clr-warning);
    }
    .cost-cap {
        color: var(--clr-text-3);
        font-weight: 400;
    }
    .cost-bar {
        width: 72px;
        height: 6px;
        background: var(--cost-bar-track);
        border-radius: 3px;
        overflow: hidden;
    }
    .cost-bar__fill {
        height: 100%;
        background: var(--clr-success);
        border-radius: 3px;
        transition:
            width 0.4s ease,
            background 0.3s ease;
        /* marker-pen texture: slight gradient */
        background-image: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.12) 0%,
            transparent 60%
        );
    }
    .cost-bar__fill.near-cap {
        background-color: var(--clr-warning);
    }
</style>
