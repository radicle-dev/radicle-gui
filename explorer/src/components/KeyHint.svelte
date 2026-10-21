<script lang="ts">
  export let styleDisplay: "inline-flex" | "flex" = "inline-flex";
</script>

<style>
  kbd {
    align-items: center;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--color-border-mid);
    justify-content: center;
    padding: 0 0.25rem;
  }
</style>

<kbd style:display={styleDisplay}>
  <slot />
</kbd>
