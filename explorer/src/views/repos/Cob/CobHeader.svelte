<script lang="ts">
</script>

<style>
  .header {
    display: flex;
    padding: 1rem;
    flex-direction: column;
    background-color: var(--color-surface-canvas);
  }
  .subtitle {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .description {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    margin-top: 2rem;
    word-break: break-word;
  }
</style>

<div class="header">
  <div role="heading" aria-level={2} class="summary">
    <slot name="title" />
  </div>
  <div class="subtitle">
    <slot name="state" />
  </div>
  <slot name="subtitle" />
  <div class="description">
    <slot name="description" />
  </div>
</div>
