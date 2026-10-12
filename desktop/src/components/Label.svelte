<script lang="ts">
  interface Props {
    label: string;
  }

  const { label }: Props = $props();
</script>

<style>
  .label {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    height: 2rem;
    padding: 0 0.5rem;
    color: var(--color-text-tertiary);
    max-width: 10rem;
  }
</style>

<div class="label txt-body-m-regular">
  <div class="txt-overflow" title={label}>{label}</div>
</div>
