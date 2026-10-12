<script lang="ts">
  import type { Config } from "@bindings/config/Config";
  import type { ComponentProps } from "svelte";

  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import type { Entity } from "@app/lib/mentions";
  import { entityUrl } from "@app/lib/mentions";
  import {
    defaultShareAction,
    type ShareAction,
    shareAction,
  } from "@app/lib/shareAction.svelte";
  import { explorerHost } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";

  type IconName = ComponentProps<typeof Icon>["name"];

  interface Props {
    target: Entity;
    id: string;
    // The noun the id represents, e.g. "issue", so "copy id" reads "Copy issue ID".
    idLabel: string;
    config: Config;
    styleHeight?: ComponentProps<typeof Button>["styleHeight"];
    variant?: ComponentProps<typeof Button>["variant"];
  }

  const {
    target,
    id,
    idLabel,
    config,
    styleHeight = "2rem",
    variant = "ghost",
  }: Props = $props();

  const url = $derived(entityUrl(target, config) ?? "");
  const host = $derived(explorerHost(config));

  const actions = $derived<
    { kind: ShareAction; icon: IconName; label: string; title: string }[]
  >([
    {
      kind: "open",
      icon: "open-external",
      label: "Open on web",
      title: `Open on ${host}`,
    },
    {
      kind: "copyLink",
      icon: "link",
      label: "Copy link",
      title: `Copy link to ${host}`,
    },
    {
      kind: "copyId",
      icon: "copy",
      label: "Copy ID",
      title: `Copy ${idLabel} ID`,
    },
  ]);

  // The lookup always matches; the fallback only narrows away `undefined`.
  const selected = $derived(
    actions.find(a => a.kind === shareAction.value) ??
      actions.find(a => a.kind === defaultShareAction)!,
  );

  let popoverExpanded: boolean = $state(false);

  let copied: boolean = $state(false);
  const restore = debounce(() => {
    copied = false;
  }, 1000);

  let anchorEl: HTMLAnchorElement | undefined = $state();

  async function run(kind: ShareAction) {
    if (kind === "open") {
      anchorEl?.click();
      return;
    }
    try {
      await writeToClipboard(kind === "copyLink" ? url : id);
      copied = true;
      restore();
    } catch {
      // Ignore clipboard failures; there's nothing useful to show the user.
    }
  }
</script>

<style>
  /* The 1px gap reveals the container's background as a divider between the two
     buttons, which relies on the buttons having an opaque fill (ghost). */
  .split {
    display: inline-flex;
    gap: 1px;
    background-color: var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  /* Naked buttons are transparent, so drop the divider background that would
     otherwise show through and read as a grey fill. */
  .split.naked {
    background-color: transparent;
    gap: 0;
  }
</style>

<!-- Hidden anchor used for the "open" action so Tauri's shell plugin opens the
     link in the system browser, matching how ExternalLink behaves. -->
<a
  bind:this={anchorEl}
  href={url}
  target="_blank"
  rel="noreferrer"
  style:display="none"
  tabindex="-1"
  aria-hidden="true">
</a>

<div class="split" class:naked={variant === "naked"}>
  <Button
    {variant}
    {styleHeight}
    flatRight
    stylePadding="0 0.75rem"
    title={selected.title}
    onclick={() => run(selected.kind)}>
    <Icon
      name={copied && selected.kind !== "open" ? "checkmark" : selected.icon} />
    <span class="global-hide-on-medium-desktop-down">{selected.label}</span>
  </Button>

  <Popover
    popoverPadding="0"
    placement="bottom-end"
    bind:expanded={popoverExpanded}>
    {#snippet toggle(onclick)}
      <Button
        {variant}
        {styleHeight}
        styleWidth={styleHeight}
        flatLeft
        stylePadding="0"
        active={popoverExpanded}
        title="Share options"
        {onclick}>
        <Icon name={popoverExpanded ? "chevron-up" : "chevron-down"} />
      </Button>
    {/snippet}
    {#snippet popover()}
      <div
        style:border="1px solid var(--color-border-subtle)"
        style:border-radius="var(--border-radius-sm)"
        style:background-color="var(--color-surface-canvas)"
        style:padding="0.25rem">
        <DropdownList items={actions}>
          {#snippet item(action)}
            <DropdownListItem
              selected={action.kind === selected.kind}
              styleGap="0.5rem"
              onclick={() => {
                shareAction.value = action.kind;
                closeFocused();
                void run(action.kind);
              }}>
              <Icon name={action.icon} />
              <span>{action.title}</span>
            </DropdownListItem>
          {/snippet}
        </DropdownList>
      </div>
    {/snippet}
  </Popover>
</div>
