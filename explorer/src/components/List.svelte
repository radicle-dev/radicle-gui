<script lang="ts" generics="T">
  export let items: T[];
</script>

<style>
  .list {
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .list-item:not(:last-child) {
    border-bottom: 1px solid var(--color-border-subtle);
  }
</style>

{#if items.length > 0}
  <div class="list">
    {#each items as item}
      <div class="list-item">
        <slot name="item" {item} />
      </div>
    {/each}
  </div>
{/if}
