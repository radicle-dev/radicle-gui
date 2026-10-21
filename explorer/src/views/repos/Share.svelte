<script lang="ts">
  import config from "@app/lib/config";
  import debounce from "lodash/debounce";
  import { toClipboard } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  let shareIcon: "link" | "checkmark" = "link";

  const restoreIcon = debounce(() => {
    shareIcon = "link";
  }, 1000);

  async function copy() {
    const text = new URL(config.nodes.fallbackPublicExplorer).origin.concat(
      window.location.pathname,
    );
    await toClipboard(text);
    shareIcon = "checkmark";
    restoreIcon();
  }
</script>

<Button variant="outline" size="regular" on:click={copy}>
  <Icon name={shareIcon} />
  <span class="global-hide-on-small-desktop-down">Copy link</span>
</Button>
