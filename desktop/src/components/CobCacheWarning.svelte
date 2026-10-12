<script lang="ts">
  import type { CacheEvent } from "@bindings/cob/CacheEvent";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Spinner from "@app/components/Spinner.svelte";

  interface Props {
    noun: string;
    cacheState: CacheEvent | undefined;
    onRebuild: () => Promise<void>;
  }

  const { noun, cacheState, onRebuild }: Props = $props();
</script>

<style>
  .container {
    padding: 1rem;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.25rem 0.5rem;
    overflow: hidden;
    border: 1px solid var(--color-feedback-warning-border);
    border-radius: var(--border-radius-md);
    background-color: var(--color-feedback-warning-bg);
  }
  .action {
    margin-left: auto;
  }
</style>

<div class="container">
  <div class="banner">
    <div class="txt-overflow txt-body-m-regular global-flex">
      <Icon name="warning" />
      <span class="txt-overflow">
        There's a problem with your COB cache, so some {noun} may not be displayed.
        You can rebuild the cache to resolve this.
      </span>
    </div>
    <div class="action">
      <Button
        variant="naked"
        onclick={onRebuild}
        disabled={cacheState !== undefined}>
        {#if cacheState?.event === "started" || cacheState?.event === "progress"}
          Rebuilding
          <Spinner />
        {:else if cacheState?.event === "finished"}
          Done
          <Icon name="checkmark" />
        {:else}
          Rebuild cache
        {/if}
      </Button>
    </div>
  </div>
</div>
