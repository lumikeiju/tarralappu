<script lang="ts">
    const {
        src,
        alt,
        open,
        onClose
    }: {
        src: string;
        alt: string;
        open: boolean;
        onClose: () => void;
    } = $props();

    let dialogEl: HTMLDialogElement | undefined = $state();

    $effect(() => {
        if (!dialogEl) return;
        if (open && !dialogEl.open) {
            dialogEl.showModal();
        } else if (!open && dialogEl.open) {
            dialogEl.close();
        }
    });

    function onNativeClose() {
        onClose();
    }

    // Close when clicking the backdrop area (the inner wrapper, not a child element)
    function onBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }
</script>

<dialog
    bind:this={dialogEl}
    class="lightbox"
    aria-label="Image viewer"
    onclose={onNativeClose}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="lightbox__inner" role="presentation" onclick={onBackdropClick}>
        <button
            class="lightbox__close"
            onclick={onClose}
            aria-label="Close image viewer"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                width="16"
                height="16"
                aria-hidden="true"
            >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        </button>
        <img class="lightbox__img" {src} {alt} />
    </div>
</dialog>

<style>
    .lightbox {
        background: transparent;
        border: none;
        padding: 0;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        overflow: hidden;
        /*
         * Do NOT set display here — this element is a <dialog>.
         * The UA applies display:none for closed dialogs; any author
         * display value would override that and show all dialogs on load.
         * Centering is handled by the inner wrapper div instead.
         */
    }

    .lightbox__inner {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        position: relative;
    }

    /* ::backdrop doesn't inherit the Svelte scope attribute — use :global */
    :global(.lightbox::backdrop) {
        background: rgba(0, 0, 0, 0.78);
    }

    @media (prefers-reduced-motion: no-preference) {
        :global(.lightbox::backdrop) {
            /* lightbox-bd-in is defined globally in app.css */
            animation: lightbox-bd-in 0.18s ease;
        }
    }

    .lightbox__img {
        max-width: 92vw;
        max-height: 92vh;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        border: 4px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 4px 32px rgba(0, 0, 0, 0.6);
        border-radius: 3px;
    }

    @media (prefers-reduced-motion: no-preference) {
        .lightbox__img {
            animation: lightbox-img-in 0.15s ease;
        }

        @keyframes lightbox-img-in {
            from {
                opacity: 0;
                transform: scale(0.96);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
    }

    .lightbox__close {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 36px;
        height: 36px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        border: 1px solid transparent;
        border-radius: 50%;
        backdrop-filter: blur(4px);
        cursor: pointer;
        transition: background 0.12s;
        z-index: 1;
    }

    .lightbox__close:hover {
        background: rgba(0, 0, 0, 0.8);
    }

    .lightbox__close:focus-visible {
        outline: 2px solid transparent;
        box-shadow: var(--focus-ring);
    }
</style>
