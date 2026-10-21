<script lang="ts">
  export let ariaLabel: string | undefined = undefined;
  export let outline: boolean = false;
  export let styleGap: string | undefined = undefined;
</script>

<style>
  .radio {
    display: flex;
    border-radius: var(--border-radius-sm);
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }
  .outline {
    display: flex;
    border: 1px solid var(--color-border-brand);
    padding: 3px;
    border-radius: var(--border-radius-sm);
    gap: 0.25rem;
  }
</style>

<div aria-label={ariaLabel} class="radio" class:outline style:gap={styleGap}>
  <slot />
</div>
