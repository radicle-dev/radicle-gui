<script lang="ts">
  import Icon from "@app/components/Icon.svelte";

  const {
    name,
    onSelect,
    active,
    indent = 0.5,
  }: {
    name: string;
    onSelect: () => void;
    active: boolean;
    indent?: number;
  } = $props();
</script>

<style>
  .file {
    width: 100%;
    cursor: pointer;
    white-space: nowrap;
    border-radius: var(--border-radius-sm);
  }
  .file:hover,
  .active {
    background-color: var(--color-surface-subtle);
  }
  .active:hover {
    background-color: var(--color-surface-strong);
  }
  .file:hover .icon,
  .active .icon {
    color: var(--color-text-primary);
  }
</style>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="file"
  class:active
  style:padding-left="{indent}rem"
  style:padding-right="0.5rem"
  onclick={onSelect}>
  <div class="global-flex" style:padding="0.25rem 0">
    <div class="icon txt-missing">
      <Icon name="document" />
    </div>
    <div class="txt-body-m-regular txt-overflow">
      {name}
    </div>
  </div>
</div>
