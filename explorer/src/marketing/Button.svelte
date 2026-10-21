<script lang="ts">
  export let href: string | undefined = undefined;
  export let variant: "primary" | "secondary" | "white" = "primary";
  export let target: string | undefined = undefined;
  export let rel: string | undefined = undefined;
</script>

<style>
  .button {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    padding: 0.375rem 0.75rem;
    gap: 0.5rem;
    height: var(--button-small-height);
    border-radius: var(--border-radius-tiny);
    border: none;
    cursor: pointer;
    text-decoration: none;
    font: var(--txt-bold-14);
    text-align: center;
  }

  .button:hover {
    text-decoration: none;
  }

  .button.primary {
    background: var(--color-text-primary);
    color: var(--color-surface-base);
  }

  .button.primary:hover {
    opacity: 0.9;
    color: var(--color-surface-base);
  }

  .button.secondary {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }

  .button.secondary:hover {
    background: var(--color-surface-mid);
    color: var(--color-text-primary);
  }

  .button.white {
    background: var(--color-neutrals-opaque-light-0);
    color: var(--color-neutrals-opaque-light-900);
  }

  .button.white:hover {
    color: var(--color-neutrals-opaque-light-900);
  }
</style>

{#if href}
  <a {href} {target} {rel} class="button {variant}">
    <slot />
  </a>
{:else}
  <button class="button {variant}">
    <slot />
  </button>
{/if}
