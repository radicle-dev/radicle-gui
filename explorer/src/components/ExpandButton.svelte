<script lang="ts">
  import { createEventDispatcher } from "svelte";

  import IconButton from "./IconButton.svelte";
  import Icon from "./Icon.svelte";

  export let variant: "left-aligned" | "inline" = "left-aligned";
  export let expanded: boolean = true;

  const dispatch = createEventDispatcher<{
    toggle: { expanded: boolean };
  }>();
</script>

<style>
  .expand {
    display: flex;
    background: none;
  }
</style>

<IconButton
  ariaLabel="expand"
  on:click={() => {
    expanded = !expanded;
    dispatch("toggle", { expanded });
  }}>
  <div class="expand">
    {#if expanded}
      <Icon name={variant === "inline" ? "ellipsis" : "chevron-down"} />
    {:else}
      <Icon name={variant === "inline" ? "ellipsis" : "chevron-right"} />
    {/if}
  </div>
</IconButton>
