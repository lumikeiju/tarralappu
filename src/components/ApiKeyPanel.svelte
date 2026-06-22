<script lang="ts">
    import {
        auth,
        settings,
        setApiKey,
        clearApiKey
    } from "../lib/state/settings.svelte";
    import Admonition from "./Admonition.svelte";

    let inputKey = $state("");
    let showKey = $state(false);
    let remember = $state(false);
    let editing = $state(!auth.apiKey);

    function submit(e: SubmitEvent) {
        e.preventDefault();
        const trimmed = inputKey.trim();
        if (!trimmed) return;
        setApiKey(trimmed, remember);
        inputKey = "";
        editing = false;
    }

    function disconnect() {
        clearApiKey();
        inputKey = "";
        remember = false;
        editing = true;
    }

    $effect(() => {
        if (!auth.apiKey) editing = true;
    });
</script>

<div class="api-key-panel">
    {#if auth.apiKey && !editing}
        <div class="connected">
            <span class="connected__badge" aria-label="API key set">Key ✓</span>
            <button class="btn-ghost" onclick={disconnect}>Change key</button>
        </div>
    {:else}
        <form onsubmit={submit} class="key-form">
            <label for="api-key-input" class="key-label"
                >OpenRouter API key</label
            >
            <div class="key-row">
                <div class="key-input-wrap">
                    <input
                        id="api-key-input"
                        type={showKey ? "text" : "password"}
                        bind:value={inputKey}
                        placeholder="sk-or-v1-…"
                        autocomplete="off"
                        spellcheck={false}
                        aria-describedby="key-hint"
                    />
                    <button
                        type="button"
                        class="btn-icon show-toggle"
                        onclick={() => (showKey = !showKey)}
                        aria-label={showKey ? "Hide key" : "Show key"}
                        >{showKey ? "🙈" : "👁"}</button
                    >
                </div>
                <button
                    type="submit"
                    class="btn-primary"
                    disabled={!inputKey.trim()}
                >
                    Connect
                </button>
            </div>

            <div class="remember-row">
                <label class="remember-label">
                    <input type="checkbox" bind:checked={remember} />
                    Remember on this device
                </label>
            </div>

            {#if remember}
                <Admonition type="danger">
                    <strong>Security warning:</strong> storing your API key in localStorage
                    exposes it to any JavaScript running on this page (XSS). Only
                    check this on a personal, trusted device.
                </Admonition>
            {/if}

            <p id="key-hint" class="hint">
                Your key is sent directly to OpenRouter — never to any server we
                control.
            </p>
        </form>
    {/if}
</div>

<style>
    .api-key-panel {
        min-width: 240px;
    }
    .connected {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .connected__badge {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--clr-success);
        background: var(--clr-success-bg);
        border-radius: 4px;
        padding: 2px 8px;
    }
    .key-form {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .key-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--clr-text-2);
    }
    .key-row {
        display: flex;
        gap: 6px;
        align-items: stretch;
    }
    .key-input-wrap {
        position: relative;
        flex: 1;
    }
    .key-input-wrap input {
        padding-right: 36px;
    }
    .show-toggle {
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.875rem;
    }
    .remember-row {
        display: flex;
        align-items: center;
    }
    .remember-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        cursor: pointer;
        color: var(--clr-text-2);
    }
    .remember-label input[type="checkbox"] {
        width: auto;
        cursor: pointer;
    }
    .hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        margin: 0;
    }
</style>
