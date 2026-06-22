<script lang="ts">
    import type { Snippet } from "svelte";

    const {
        color = "default",
        title,
        class: extraClass = "",
        children
    }: {
        color?: "yellow" | "green" | "blue" | "pink" | "default";
        title?: string;
        class?: string;
        children: Snippet;
    } = $props();

    const noteVars = $derived(
        color === "yellow"
            ? "--note-bg: var(--note-yellow-bg); --note-edge: var(--note-yellow-edge); --note-tape: var(--note-yellow-tape);"
            : color === "green"
              ? "--note-bg: var(--note-green-bg); --note-edge: var(--note-green-edge); --note-tape: var(--note-green-tape);"
              : color === "blue"
                ? "--note-bg: var(--note-blue-bg); --note-edge: var(--note-blue-edge); --note-tape: var(--note-blue-tape);"
                : color === "pink"
                  ? "--note-bg: var(--note-pink-bg); --note-edge: var(--note-pink-edge); --note-tape: var(--note-pink-tape);"
                  : ""
    );
</script>

<section class="note-panel card {extraClass}" style={noteVars}>
    {#if title}
        <h2 class="note-panel__title">{title}</h2>
    {/if}
    {@render children()}
</section>

<style>
    .note-panel__title {
        font-family: var(--font-display);
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--clr-text-2);
        letter-spacing: 0.02em;
        text-transform: uppercase;
        margin-bottom: var(--sp-2);
    }
</style>
