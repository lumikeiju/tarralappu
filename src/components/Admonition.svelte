<script lang="ts">
    import type { Snippet } from "svelte";

    const {
        type = "info",
        children
    }: {
        type?: "info" | "warning" | "danger";
        children: Snippet;
    } = $props();

    const icons = { info: "ℹ", warning: "⚠", danger: "⚠" };
</script>

<div
    class="admonition admonition--{type}"
    role={type === "danger" ? "alert" : type === "warning" ? "status" : "note"}
>
    <span class="admonition__icon" aria-hidden="true">{icons[type]}</span>
    <div class="admonition__body">{@render children()}</div>
</div>

<style>
    .admonition {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        border-radius: 4px;
        border: 1px solid;
        padding: 8px 12px;
        font-size: 0.8125rem;
        line-height: 1.5;
    }
    .admonition--info {
        background: var(--clr-surface-2);
        border-color: var(--clr-border);
        color: var(--clr-text-2);
    }
    .admonition--warning {
        background: var(--clr-warning-bg);
        border-color: var(--clr-warning-border);
        color: var(--clr-warning);
    }
    .admonition--danger {
        background: var(--clr-danger-bg);
        border-color: var(--clr-danger-border);
        color: var(--clr-danger);
    }
    .admonition__icon {
        flex-shrink: 0;
        font-size: 0.875rem;
        line-height: 1.5;
    }
    .admonition__body {
        flex: 1;
        min-width: 0;
    }
</style>
