<script lang="ts">
  interface Props {
    // A public key, without the `did:key:` prefix.
    publicKey: string;
    // The device name the key's node goes by. It only labels the key: a
    // look-alike can copy it.
    name?: string;
  }

  const { publicKey, name }: Props = $props();

  // Large and in two even lines, so two screens can be compared a line at a
  // time.
  const LINES = 2;
  const lines = $derived.by(() => {
    const length = Math.ceil(publicKey.length / LINES);
    return Array.from({ length: LINES }, (_, i) =>
      publicKey.slice(i * length, (i + 1) * length),
    );
  });
</script>

<style>
  .key {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-primary);
    font: var(--txt-code-regular);
    font-size: 1.125rem;
    line-height: 1.75rem;
    letter-spacing: 0.2em;
  }
  .name {
    margin-top: 0.5rem;
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
    letter-spacing: normal;
  }
</style>

<div class="key" aria-label={publicKey}>
  {#each lines as line, index (index)}
    <span>{line}</span>
  {/each}

  {#if name}
    <span class="name txt-body-m-medium">{name}</span>
  {/if}
</div>
