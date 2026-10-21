<script lang="ts">
  import type { BaseUrl } from "@http-client";

  import { onDestroy } from "svelte";
  import { quadInOut, sineInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";

  import Icon from "@app/components/Icon.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import RepoSearch from "./RepoSearch.svelte";

  export let baseUrl: BaseUrl;

  let open = false;

  function openSearch() {
    open = true;
  }

  function closeSearch() {
    open = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      open = true;
    } else if (event.key === "Escape" && open) {
      closeSearch();
    }
  }

  // Lock background scrolling while the overlay is open.
  $: if (typeof document !== "undefined") {
    document.body.style.overflow = open ? "hidden" : "";
  }

  onDestroy(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  });
</script>

<style>
  .trigger {
    display: flex;
    align-items: center;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 400;
    background-color: var(--color-surface-base);
    opacity: 0.7;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
  }
  .overlay {
    position: fixed;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 401;
    width: calc(100vw - 1rem);
    max-width: 36rem;
  }
  .overlay :global(.input-wrapper) {
    box-shadow: var(--elevation-low);
  }
</style>

<svelte:window on:keydown={handleKeydown} />

{#if !open}
  <div
    class="trigger"
    transition:fly={{ duration: 225, x: -44, easing: quadInOut }}>
    <IconButton inline ariaLabel="Search repositories" on:click={openSearch}>
      <Icon name="search" />
    </IconButton>
  </div>
{/if}

{#if open}
  <button
    class="backdrop"
    aria-label="Close search"
    transition:fade={{ duration: 160 }}
    on:click={closeSearch}>
  </button>
  <div
    class="overlay"
    transition:fly={{ duration: 225, x: 44, easing: sineInOut }}>
    <RepoSearch {baseUrl} autofocus showClose on:close={closeSearch} />
  </div>
{/if}
