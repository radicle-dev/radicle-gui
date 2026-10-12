<script lang="ts">
  import type { Config } from "@bindings/config/Config";

  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import { didFromPublicKey, explorerHost, truncateDid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  interface Props {
    config: Config;
  }

  const { config }: Props = $props();

  let popoverExpanded: boolean = $state(false);
  let copyIcon: "copy" | "checkmark" = $state("copy");
  const restoreCopyIcon = debounce(() => {
    copyIcon = "copy";
  }, 1000);
</script>

<Popover placement="bottom-start" bind:expanded={popoverExpanded}>
  {#snippet toggle(onclick)}
    <Button
      variant="naked"
      styleWidth="100%"
      styleJustifyContent="flex-start"
      active={popoverExpanded}
      {onclick}>
      <UserAvatar nodeId={config.publicKey} styleWidth="1rem" />
      <span class="label">{config.alias}</span>
      <span class="label" style:color="var(--color-text-tertiary)">
        <Icon name={popoverExpanded ? "chevron-up" : "chevron-down"} />
      </span>
    </Button>
  {/snippet}
  {#snippet popover()}
    <div
      style:border="1px solid var(--color-border-subtle)"
      style:border-radius="var(--border-radius-md)"
      style:background-color="var(--color-surface-canvas)"
      style:padding="0.25rem">
      <DropdownListItem
        styleGap="0.5rem"
        styleWidth="100%"
        selected={false}
        onclick={async () => {
          await writeToClipboard(didFromPublicKey(config.publicKey));
          copyIcon = "checkmark";
          restoreCopyIcon();
          closeFocused();
        }}>
        <Icon name="avatar-incognito" />
        {truncateDid(config.publicKey)}
        <span style:margin-left="auto"><Icon name={copyIcon} /></span>
      </DropdownListItem>
      <a
        style:text-decoration="none"
        style:width="100%"
        onclick={closeFocused}
        href={entityUrl({ type: "node", nid: config.publicKey }, config)}
        target="_blank">
        <DropdownListItem styleGap="0.5rem" styleWidth="100%" selected={false}>
          <Icon name="seed" />
          Open in {explorerHost(config)}
          <span style:margin-left="auto"><Icon name="open-external" /></span>
        </DropdownListItem>
      </a>
    </div>
  {/snippet}
</Popover>
