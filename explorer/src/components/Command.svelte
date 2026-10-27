<script lang="ts">
  import Clipboard from "@app/components/Clipboard.svelte";
  import Icon from "@app/components/Icon.svelte";

  export let command: string;
  export let fullWidth: boolean = false;
  export let showPrompt: boolean = true;
  export let downloadHref: string | undefined = undefined;

  let clipboard: Clipboard;
</script>

<style>
  .wrapper {
    display: flex;
  }
  .cmd {
    cursor: pointer;
    height: 2.5rem;
    border-radius: var(--border-radius-sm);
    display: flex;
    align-items: center;
    font: var(--txt-code-regular);
    padding: 0 2rem 0 0.75rem;
    position: relative;
    border: 1px solid var(--color-border-alpha-subtle);
    color: var(--color-text-secondary);
    background-color: var(--color-surface-alpha-mid);
    user-select: none;
    overflow: hidden;
  }
  .cmd:hover {
    border: 1px solid var(--color-border-mid);
    color: var(--color-text-primary);
  }
  .with-download {
    padding-right: 3.5rem;
  }
  .actions {
    display: flex;
    align-items: center;
    position: absolute;
    right: 0.25rem;
    top: 0;
    height: 100%;
  }
  .download {
    width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    color: inherit;
  }

  .full-width.wrapper,
  .full-width.cmd {
    width: 100%;
  }
</style>

<div class="wrapper" class:full-width={fullWidth}>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    role="button"
    tabindex="0"
    class="cmd"
    class:full-width={fullWidth}
    class:with-download={downloadHref}
    on:click={() => {
      clipboard.copy();
    }}>
    <div class="txt-overflow">
      {#if showPrompt}${/if}
      {command}
    </div>
    <div class="actions">
      {#if downloadHref}
        <a
          class="download"
          href={downloadHref}
          download
          aria-label="Download"
          title="Download"
          on:click|stopPropagation>
          <Icon name="download" />
        </a>
      {/if}
      <Clipboard bind:this={clipboard} text={command} />
    </div>
  </div>
</div>
