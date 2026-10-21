<script lang="ts">
  interface Props {
    insertions: number;
    deletions: number;
    hoverable?: boolean;
  }

  const { insertions, deletions, hoverable }: Props = $props();
</script>

<style>
  .badge {
    display: flex;
    font: var(--txt-body-s-regular);
    height: var(--button-tiny-height);
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    border-radius: var(--border-radius-sm);
  }
  .badge:hover {
    background-color: var(--color-surface-alpha-mid);
  }
  .positive {
    display: flex;
    padding: 0 4px;
    align-items: center;
    color: var(--color-text-open);
  }
  .negative {
    display: flex;
    padding: 0 4px;
    align-items: center;
    color: var(--color-feedback-error-text);
  }
</style>

<div class="badge" class:hoverable>
  <div class="positive">
    +{insertions}
  </div>
  <div class="negative">
    -{deletions}
  </div>
</div>
