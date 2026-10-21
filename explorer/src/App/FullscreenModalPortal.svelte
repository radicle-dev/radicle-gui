<script lang="ts">
  import { modalStore, hide } from "@app/lib/modal";
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
    background-color: black;
    opacity: 0.7;
    height: 100%;
    width: 100%;
    position: fixed;
  }

  .content {
    z-index: 200;
    margin: auto;
  }
</style>

{#if $modalStore}
  <div class="container">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      role="button"
      tabindex="0"
      class="overlay"
      on:click={hide}
      style:cursor={$modalStore.disableHide ? "not-allowed" : "default"}>
    </div>
    <div class="content">
      <svelte:component this={$modalStore.component} {...$modalStore.props} />
    </div>
  </div>
{/if}
