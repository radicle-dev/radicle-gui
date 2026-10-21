<script lang="ts">
  import { onDestroy } from "svelte";

  export let command = "curl -sSf https://radicle.dev/install | sh";

  let isCopied = false;
  let resetCopyStateTimeout: ReturnType<typeof setTimeout> | undefined;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(command);
      isCopied = true;
      if (resetCopyStateTimeout) clearTimeout(resetCopyStateTimeout);
      resetCopyStateTimeout = setTimeout(() => {
        isCopied = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  }

  onDestroy(() => {
    if (resetCopyStateTimeout) clearTimeout(resetCopyStateTimeout);
  });
</script>

<style>
  .wrapper {
    display: block;
    max-width: 100%;
    overflow: hidden;
  }

  .codeblock {
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
    gap: 0.75rem;
    background: var(--color-surface-subtle);
    border-radius: 0.25rem;
    max-width: 100%;
    box-sizing: border-box;
  }

  code {
    min-width: 0;
    font-family: "JetBrains Mono", monospace;
    font-weight: 500;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .copy-button {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    background: none;
    border: none;
    border-radius: 0.125rem;
    cursor: pointer;
    color: var(--color-text-secondary);
  }

  .copy-button:hover {
    color: var(--color-text-primary);
  }
</style>

<span class="wrapper">
  <span class="codeblock">
    <code>{command}</code>
    <button
      class="copy-button"
      aria-label={isCopied ? "Copied to clipboard" : "Copy to clipboard"}
      on:click={copyToClipboard}>
      <img
        src={isCopied ? "/icons/check.svg" : "/icons/copy.svg"}
        alt={isCopied ? "Copied" : "Copy"}
        width="16"
        height="16" />
    </button>
  </span>
</span>
