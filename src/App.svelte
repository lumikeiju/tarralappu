<script lang="ts">
    import { onMount } from "svelte";
    import { initSettings, settings } from "./lib/state/settings.svelte";
    import { initBoard, boardState } from "./lib/state/board.svelte";
    import SetupBar from "./components/SetupBar.svelte";
    import StyleDocPanel from "./components/StyleDocPanel.svelte";
    import ReferenceImages from "./components/ReferenceImages.svelte";
    import SessionCapPanel from "./components/SessionCapPanel.svelte";
    import NotePanel from "./components/NotePanel.svelte";
    import Board from "./components/Board.svelte";

    let ready = $state(false);
    let authoringOpen = $state(true);

    // Apply theme to <html> whenever setting changes
    $effect(() => {
        const theme = settings.theme;
        if (theme) {
            document.documentElement.dataset.theme = theme;
        } else {
            delete document.documentElement.dataset.theme;
        }
    });

    onMount(async () => {
        await initSettings();
        await initBoard();
        ready = true;
    });
</script>

<a href="#main-content" class="skip-link">Skip to main content</a>
<SetupBar />

{#if ready}
    <main id="main-content">
        <!-- Global authoring panel -->
        <details
            class="authoring-panel"
            bind:open={authoringOpen}
            aria-label="Style and reference panel"
        >
            <summary class="authoring-toggle">
                Style &amp; References
                <span class="authoring-toggle__hint">
                    {boardState.board?.settings.styleDoc
                        ? "Style guide set"
                        : "No style guide"}
                    ·
                    {boardState.board?.settings.styleRefImageId
                        ? "Style ref ✓"
                        : "No style ref"}
                    ·
                    {boardState.board?.settings.layoutRefImageId
                        ? "Layout ref ✓"
                        : "No layout ref"}
                </span>
            </summary>

            <div class="authoring-body">
                <NotePanel color="yellow">
                    <StyleDocPanel />
                </NotePanel>
                <NotePanel color="green">
                    <ReferenceImages />
                </NotePanel>
                <NotePanel color="blue">
                    <SessionCapPanel />
                </NotePanel>
            </div>
        </details>

        <Board />
    </main>
{:else}
    <div class="loading-screen" aria-live="polite" aria-busy="true">
        <span class="spinner" aria-hidden="true"></span>
        <span>Loading…</span>
    </div>
{/if}

<style>
    .skip-link {
        position: absolute;
        left: -9999px;
        top: 0;
        z-index: 100;
        background: var(--clr-accent);
        color: var(--clr-accent-fg);
        padding: 6px 12px;
        font-size: 0.875rem;
        font-weight: 600;
        border-radius: 0 0 4px 0;
        text-decoration: none;
    }
    .skip-link:focus {
        left: 0;
        outline: 2px solid transparent;
        box-shadow: var(--focus-ring);
    }
    .authoring-panel {
        background: var(--clr-surface);
        border-bottom: 2px solid var(--clr-border);
    }
    .authoring-toggle {
        list-style: none;
        padding: 10px 16px;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 700;
        font-family: var(--font-display);
        color: var(--clr-text);
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .authoring-toggle::-webkit-details-marker {
        display: none;
    }
    .authoring-toggle::before {
        content: "▶";
        font-size: 0.625rem;
        color: var(--clr-text-3);
        transition: transform 0.15s;
    }
    details[open] .authoring-toggle::before {
        transform: rotate(90deg);
    }
    .authoring-toggle__hint {
        font-size: 0.75rem;
        color: var(--clr-text-3);
        font-weight: 400;
    }
    .authoring-body {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 20px;
        padding: 20px 20px 24px;
        align-items: start;
    }
    @media (max-width: 700px) {
        .authoring-body {
            grid-template-columns: 1fr;
        }
    }
    .loading-screen {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-height: 200px;
        color: var(--clr-text-3);
        font-size: 0.9375rem;
    }
</style>
