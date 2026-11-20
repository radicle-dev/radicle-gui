<script lang="ts">
  import Button from "@app/components/Button.svelte";

  interface Props {
    message: string;
    // Where the banner sits in its view.
    margin: string;
    onShow: () => void;
  }

  const { message, margin, onShow }: Props = $props();
</script>

<style>
  .newer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-subtle);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
</style>

<!-- Says that newer data is available than what a view keeps showing. -->
<div class="newer" style:margin>
  {message}
  <Button variant="secondary" onclick={onShow}>Show latest</Button>
</div>
