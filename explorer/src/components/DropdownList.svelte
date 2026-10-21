<script lang="ts" generics="T">
  export let items: T[];
  export let styleDropdownMinWidth: string | undefined = undefined;
  export let styleDropdownPadding: string = "0 0 0.25rem 0";
</script>

<style>
  .dropdown {
    align-items: center;
    border-radius: var(--border-radius-sm);
    max-height: 60vh;
    overflow-y: auto;
  }
  .dropdown-item {
    padding: 0.25rem 0.25rem 0 0.25rem;
    font: var(--txt-body-m-regular);
  }
</style>

{#if items.length}
  <div
    class="dropdown"
    style:min-width={styleDropdownMinWidth}
    style:padding={styleDropdownPadding}>
    {#each items as item}
      <div class="dropdown-item">
        <slot name="item" {item} />
      </div>
    {/each}
  </div>
{/if}
