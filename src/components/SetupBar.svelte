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
                aria-controls="key-panel"
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

        <a
            class="btn-icon repo-link"
            href="https://github.com/lumikeiju/tarralappu"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View Tarralappu source on GitHub (opens in a new tab)"
            title="GitHub"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden="true"
            >
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                />
            </svg>
        </a>
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
    .repo-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        border-radius: 4px;
        cursor: pointer;
        transition:
            color 0.1s,
            background 0.1s;
    }
</style>
