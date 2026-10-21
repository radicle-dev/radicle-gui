<script lang="ts">
  import KeyHint from "@app/components/KeyHint.svelte";

  export let hideShortcuts: boolean = false;
</script>

<style>
  .help {
    font: var(--txt-body-m-regular);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }
  .item {
    display: flex;
    justify-content: space-between;
    width: 100%;
    white-space: nowrap;
    gap: 2rem;
  }
</style>

<div class="help">
  {#if !hideShortcuts}
    <div class="item">
      Keyboard shortcuts <KeyHint>?</KeyHint>
    </div>
  {/if}
</div>
