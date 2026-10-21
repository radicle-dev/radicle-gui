<svelte:options customElement="radicle-clipboard" />

<script lang="ts">
  import debounce from "lodash/debounce";
  import { createEventDispatcher } from "svelte";

  import { toClipboard } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";

  export let text: string;
  export let tooltip: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ copied: null }>();

  let icon: "copy" | "checkmark" = "copy";

  const restoreIcon = debounce(() => {
    icon = "copy";
  }, 800);

  export async function copy() {
    await toClipboard(text);
    dispatch("copied");
    icon = "checkmark";
    restoreIcon();
  }
</script>

<style>
  .copy {
    width: 1.5rem;
    height: 1.5rem;
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    user-select: none;
  }
</style>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<span
  role="button"
  tabindex="0"
  aria-label="Copy"
  title={tooltip}
  class="copy"
  on:click|stopPropagation={copy}>
  <Icon name={icon} />
</span>
