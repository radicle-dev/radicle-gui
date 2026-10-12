<script lang="ts">
  import Clipboard from "@app/components/Clipboard.svelte";

  interface Props {
    command: string;
    styleWidth: string;
    showPrompt?: boolean;
  }

  const { command, styleWidth, showPrompt = true }: Props = $props();

  let clipboard: Clipboard;
</script>

<style>
  .cmd {
    color: var(--color-text-secondary);
  }
  .cmd:hover {
    color: var(--color-text-primary);
  }
  .hoverable:hover {
    background-color: var(--color-surface-canvas);
  }
</style>

<div class="cmd txt-code-regular" style:width={styleWidth}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="hoverable"
    style:border="1px solid var(--color-border-subtle)"
    style:border-radius="var(--border-radius-sm)"
    style:display="flex"
    style:gap="0.5rem"
    style:align-items="center"
    style:background-color="var(--color-surface-canvas)"
    style:overflow="hidden"
    style:cursor="pointer"
    style:justify-content="space-between"
    style:height="2rem"
    style:padding="0 0.5rem"
    style:width={styleWidth}
    role="button"
    tabindex="0"
    onclick={() => clipboard.copy()}>
    <span class="txt-overflow">
      {showPrompt ? "$ " : ""}{command}
    </span>
    <Clipboard bind:this={clipboard} text={command} noPopover />
  </div>
</div>
