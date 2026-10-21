<script lang="ts">
  import Icon from "@app/components/Icon.svelte";

  export let count: number;

  const formatter = Intl.NumberFormat("en", { notation: "compact" });
</script>

<style>
  .item {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
  }
</style>

<div
  class="item"
  style="justify-content: space-between; display: flex; text-wrap: nowrap; font: var(--txt-body-m-regular); ">
  <span>Seeding</span>
  <div class="global-flex-item" style:gap="0.25rem">
    <Icon name="seed" />{formatter.format(count).toLowerCase()}
    <slot />
  </div>
</div>
