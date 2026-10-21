<script lang="ts">
  import type { ComponentType } from "svelte";
  import type { DocsPage } from "./types";

  import MarkdownLayout from "./MarkdownLayout.svelte";

  export let page: DocsPage;
  export let component: ComponentType;

  $: isGlossary = page === "glossary";

  // Copy a term's permalink to the clipboard instead of navigating to it, and
  // briefly show a checkmark as confirmation. Navigating to the link from
  // elsewhere still jumps to the term (default anchor behaviour).
  function copyTermLinks(node: HTMLElement) {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const link = target?.closest(".term-link") as HTMLAnchorElement | null;
      if (!link || !node.contains(link)) {
        return;
      }
      event.preventDefault();
      void navigator.clipboard?.writeText(link.href);
      // Restart the confirmation animation, which holds the checkmark and then
      // fades it out (see the `term-copied` keyframes). It is cleared on
      // animationend below.
      link.classList.remove("copied");
      void link.offsetWidth;
      link.classList.add("copied");
    }

    // Highlight the term when arriving via its permalink. `:target` is
    // unreliable here because the term element is rendered after the URL
    // fragment is already set on a fresh load, so drive it from script.
    function highlightFromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) {
        return;
      }
      const term = document.getElementById(id);
      if (!term || !node.contains(term) || !term.querySelector(".term-link")) {
        return;
      }
      term.classList.remove("arrived");
      void term.offsetWidth;
      term.classList.add("arrived");
    }

    function onAnimationEnd(event: AnimationEvent) {
      const el = event.target as HTMLElement;
      if (event.animationName === "term-arrive") {
        el.classList.remove("arrived");
      } else if (event.animationName === "term-copied") {
        el.classList.remove("copied");
      }
    }

    node.addEventListener("click", onClick);
    node.addEventListener("animationend", onAnimationEnd);
    window.addEventListener("hashchange", highlightFromHash);
    highlightFromHash();

    return {
      destroy() {
        node.removeEventListener("click", onClick);
        node.removeEventListener("animationend", onAnimationEnd);
        window.removeEventListener("hashchange", highlightFromHash);
      },
    };
  }
</script>

<style>
  .doc-glossary {
    --content-inline-gap: 4rem;
  }

  .doc-glossary :global(.page-container) {
    padding-left: var(--content-inline-gap);
    padding-right: var(--content-inline-gap);
  }

  .doc-glossary :global(.markdown-content) {
    max-width: none;
  }

  /* Match the page-title size used on the other marketing pages, rather than
     the larger default markdown h1. */
  .doc-glossary :global(.markdown-content h1) {
    font: var(--txt-bold-32);
    letter-spacing: normal;
  }

  .doc-glossary :global(.markdown-content h2) {
    scroll-margin-top: 6rem;
  }

  .doc-glossary :global(.markdown-content p) {
    color: var(--color-text-tertiary);
  }

  .doc-glossary :global(.markdown-content strong) {
    color: var(--color-text-primary);
  }

  /* Linkable entries: glossary term paragraphs, tagged with the `term` class
     by the rehypeTermAnchors plugin. */
  .doc-glossary :global(.markdown-content .term) {
    position: relative;
    padding-left: 1.5rem;
    margin-left: -1.5rem;
    scroll-margin-top: 6rem;
  }

  .doc-glossary :global(.term-link) {
    position: absolute;
    left: 0;
    top: 0.4em;
    width: 1rem;
    height: 1rem;
    opacity: 0;
    background-color: var(--color-text-tertiary);
    cursor: pointer;
    -webkit-mask: url("/icons/link.svg") center / 1rem 1rem no-repeat;
    mask: url("/icons/link.svg") center / 1rem 1rem no-repeat;
  }

  .doc-glossary :global(.markdown-content .term:hover .term-link) {
    opacity: 1;
    transition: opacity 0.15s ease;
  }

  .doc-glossary :global(.term-link.copied) {
    background-color: var(--color-text-primary);
    -webkit-mask-image: url("/icons/check.svg");
    mask-image: url("/icons/check.svg");
    animation: term-copied 2s ease forwards;
  }

  @keyframes -global-term-copied {
    0%,
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes -global-term-arrive {
    from {
      background-color: var(--color-surface-merged);
    }
    to {
      background-color: transparent;
    }
  }

  .doc-glossary :global(.markdown-content .term.arrived) {
    animation: term-arrive 2s ease-out;
  }

  @media (max-width: 90rem) {
    .doc-glossary {
      --content-inline-gap: 2rem;
    }
  }

  @media (max-width: 64rem) {
    .doc-glossary {
      --content-inline-gap: 1.5rem;
    }
  }
</style>

{#if isGlossary}
  <div class="doc-glossary" use:copyTermLinks>
    <MarkdownLayout>
      <svelte:component this={component} />
    </MarkdownLayout>
  </div>
{:else}
  <MarkdownLayout>
    <svelte:component this={component} />
  </MarkdownLayout>
{/if}
