<script lang="ts" context="module">
  function scrollParent(node: HTMLElement): HTMLElement | undefined {
    let parent = node.parentElement;
    while (parent) {
      const { overflowY } = getComputedStyle(parent);
      if (overflowY === "auto" || overflowY === "scroll") {
        return parent;
      }
      parent = parent.parentElement;
    }
    return undefined;
  }

  function onVisible(node: HTMLElement, callback: () => void) {
    let current = callback;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          current();
        }
      },
      { root: scrollParent(node), rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(node);
    return {
      update(callback: () => void) {
        current = callback;
      },
      destroy() {
        observer.disconnect();
      },
    };
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";

  import Button from "@app/components/Button.svelte";
  import Loading from "@app/components/Loading.svelte";

  export let loading: boolean;
  export let hasMore: boolean;
  export let failed: boolean = false;

  const dispatch = createEventDispatcher<{ loadMore: undefined }>();
  const observerSupported = "IntersectionObserver" in window;

  $: ready = hasMore && !loading;
  $: autoLoad = ready && !failed && observerSupported;
  $: showButton = ready && (failed || !observerSupported);
</script>

<style>
  .more {
    margin-top: 2rem;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sentinel {
    width: 100%;
    height: 1px;
  }
</style>

{#if loading || hasMore}
  <div class="more">
    {#if loading}
      <Loading noDelay small center />
    {:else if autoLoad}
      <div class="sentinel" use:onVisible={() => dispatch("loadMore")}></div>
    {:else if showButton}
      <Button
        size="large"
        variant="outline"
        on:click={() => dispatch("loadMore")}>
        {failed ? "Try again" : "More"}
      </Button>
    {/if}
  </div>
{/if}
