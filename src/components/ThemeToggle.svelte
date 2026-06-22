<script lang="ts">
    import { settings, setTheme } from "../lib/state/settings.svelte";

    function toggle() {
        const current =
            settings.theme ??
            (window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light");
        setTheme(current === "dark" ? "light" : "dark");
    }

    const isDark = $derived(
        settings.theme === "dark" ||
            (settings.theme === null && typeof window !== "undefined"
                ? window.matchMedia("(prefers-color-scheme: dark)").matches
                : false)
    );
</script>

<button
    class="btn-icon theme-toggle"
    onclick={toggle}
    aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    title={isDark ? "Light theme" : "Dark theme"}
>
    {isDark ? "☀" : "☾"}
</button>

<style>
    .theme-toggle {
        font-size: 1.1rem;
        padding: 4px 8px;
    }
</style>
