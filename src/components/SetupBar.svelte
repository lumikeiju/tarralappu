<script lang="ts">
    import ApiKeyPanel from "./ApiKeyPanel.svelte";
    import ThemeToggle from "./ThemeToggle.svelte";
    import CostMeter from "./CostMeter.svelte";
    import { settings, persistSettings } from "../lib/state/settings.svelte";

    let showKey = $state(false);

    function onConcurrencyChange(e: Event) {
        settings.concurrency =
            parseInt((e.target as HTMLInputElement).value, 10) || 1;
        void persistSettings();
    }
</script>

<header class="setup-bar">
    <div class="setup-bar__left">
        <h1 class="app-title">Tarralappu</h1>

        <div class="key-toggle">
            <button
                class="btn-ghost"
                onclick={() => (showKey = !showKey)}
                aria-expanded={showKey}
            >
                API Key <span aria-hidden="true">{showKey ? "▲" : "▼"}</span>
            </button>
        </div>
    </div>

    <div class="setup-bar__right">
        <CostMeter />

        <label class="concurrency-label">
            <span>Parallel</span>
            <input
                type="number"
                min="1"
                max="8"
                value={settings.concurrency}
                onchange={onConcurrencyChange}
                class="concurrency-input"
            />
        </label>

        <ThemeToggle />
    </div>
</header>

{#if showKey}
    <div id="key-panel" class="key-panel-dropdown">
        <ApiKeyPanel />
    </div>
{/if}

<style>
    /* Desk-rail / shelf feel */
    .setup-bar {
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--setupbar-bg);
        border-bottom: 1px solid var(--setupbar-border);
        /* shelf shadow — light source above */
        box-shadow:
            0 2px 0 rgba(0, 0, 0, 0.04),
            0 3px 8px rgba(0, 0, 0, 0.08);
        padding: 8px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
    }
    .setup-bar__left,
    .setup-bar__right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }
    .app-title {
        font-size: 1rem;
        font-weight: 700;
        font-family: var(--font-display);
        color: var(--clr-text);
        letter-spacing: 0.04em;
        margin: 0;
    }
    .key-panel-dropdown {
        background: var(--setupbar-bg);
        border-bottom: 1px solid var(--setupbar-border);
        padding: 12px 18px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .concurrency-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--clr-text-2);
        font-weight: 500;
    }
    .concurrency-input {
        width: 52px;
        padding: 2px 6px;
        font-size: 0.8125rem;
        text-align: center;
    }
</style>
