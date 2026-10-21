<script lang="ts">
  import Icon from "@app/components/Icon.svelte";

  export let active: boolean;
  export let name: string;
</script>

<style>
  .file {
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    display: flex;
    margin: 0.25rem 0;
    padding: 0.25rem 0.875rem;
    width: 100%;
    gap: 0.25rem;
  }

  .file:hover {
    background-color: var(--color-surface-subtle);
  }

  .file.active {
    color: var(--color-text-primary) !important;
    background-color: var(--color-surface-mid);
  }

  .file.active:hover {
    background-color: var(--color-surface-strong);
  }

  .name {
    user-select: none;
    white-space: nowrap;
    text-overflow: ellipsis !important;
    overflow: hidden;
    font: var(--txt-body-m-regular);
  }
  .icon-container {
    color: var(--color-text-tertiary);
    display: flex;
    justify-content: center;
    align-items: center;
    margin-right: 0.125rem;
  }
  .active .icon-container {
    color: var(--color-text-primary);
  }
</style>

<div class="file" class:active>
  <div class="icon-container">
    <Icon name="document" />
  </div>
  <span class="name">{name}</span>
</div>
