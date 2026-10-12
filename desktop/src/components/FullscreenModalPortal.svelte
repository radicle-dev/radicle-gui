<script lang="ts">
  import { fade } from "svelte/transition";

  import { hide, modalStore } from "@app/lib/modal";
  import { DRAG_REGION_HEIGHT } from "@app/lib/window";

  // Only Tauri drags the window, and outside it the strip would do nothing but
  // swallow the scrim clicks that dismiss the modal.
  const dragRegion = Boolean(window.__TAURI_INTERNALS__);
</script>

<style>
  .container {
    height: 100vh;
    width: 100vw;
    position: fixed;
    z-index: 300;
    justify-content: center;
    overflow: scroll;
    display: flex;
  }

  .overlay {
    background-color: var(--color-surface-scrim);
    height: 100%;
    width: 100%;
    position: fixed;
  }

  .drag-region {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 100;
  }

  .content {
    z-index: 200;
    margin: auto;
  }
</style>

{#if $modalStore}
  <div class="container">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      role="button"
      tabindex="0"
      class="overlay"
      transition:fade={{ duration: 120 }}
      onclick={$modalStore.disableScrimClose ? undefined : hide}
      style:cursor={$modalStore.disableHide ? "not-allowed" : "default"}>
    </div>
    {#if dragRegion}
      <div
        class="drag-region"
        style:height="{DRAG_REGION_HEIGHT}px"
        style:cursor={$modalStore.disableHide ? "not-allowed" : "default"}
        data-tauri-drag-region>
      </div>
    {/if}
    <div class="content" data-modal-content>
      <svelte:component this={$modalStore.component} {...$modalStore.props} />
    </div>
  </div>
{/if}
