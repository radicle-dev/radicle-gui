<script lang="ts">
  import type { ComponentProps } from "svelte";
  import type { ShareAction } from "@app/lib/shareAction";

  import config from "@app/lib/config";
  import debounce from "lodash/debounce";
  import { push } from "@app/lib/router";
  import { shareAction } from "@app/lib/shareAction";
  import { toClipboard } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownList/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";

  export let repoId: string;
  export let resource: string | undefined = undefined;
  export let id: string;
  export let idLabel: string;
  export let path: string | undefined = undefined;

  const origin = new URL(config.nodes.fallbackPublicExplorer).origin;
  const host = new URL(origin).host;

  $: uri = resource ? `${repoId}/${resource}` : repoId;

  $: actions = [
    {
      kind: "openInApp",
      icon: "device",
      label: "Open in app",
      title: "Open in app",
      tooltip: uri,
    },
    {
      kind: "copyLink",
      icon: "link",
      label: "Copy link",
      title: `Copy link to ${host}`,
      tooltip: undefined,
    },
    {
      kind: "copyId",
      icon: "copy",
      label: "Copy ID",
      title: `Copy ${idLabel} ID`,
      tooltip: undefined,
    },
    {
      kind: "copyUri",
      icon: "copy",
      label: "Copy URI",
      title: "Copy rad: URI",
      tooltip: uri,
    },
  ] satisfies {
    kind: ShareAction;
    icon: ComponentProps<Icon>["name"];
    label: string;
    title: string;
    tooltip: string | undefined;
  }[];

  $: selected = actions.find(a => a.kind === $shareAction) ?? actions[1];

  let copied = false;
  const restore = debounce(() => {
    copied = false;
  }, 1000);

  async function run(kind: ShareAction) {
    if (kind === "openInApp") {
      openInApp();
      return;
    }
    await toClipboard(
      kind === "copyLink"
        ? origin.concat(path ?? window.location.pathname)
        : kind === "copyUri"
          ? uri
          : id,
    );
    copied = true;
    restore();
  }

  function openInApp() {
    let launched = false;
    const onLeave = () => (launched = true);
    window.addEventListener("blur", onLeave, { once: true });
    document.addEventListener("visibilitychange", onLeave, { once: true });

    window.location.assign(uri);

    setTimeout(() => {
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
      if (!launched) {
        void push({ resource: "desktop", params: undefined });
      }
    }, 1500);
  }
</script>

<style>
  .split {
    display: inline-flex;
  }
  .toggle {
    margin-left: -1px;
  }
</style>

<div class="split">
  <Button
    variant="outline"
    title={selected.tooltip ?? selected.title}
    styleBorderRadius="var(--border-radius-sm) 0 0 var(--border-radius-sm)"
    on:click={() => run(selected.kind)}>
    <Icon
      name={copied && selected.kind !== "openInApp"
        ? "checkmark"
        : selected.icon} />
    <span class="global-hide-on-small-desktop-down">{selected.label}</span>
  </Button>

  <div class="toggle">
    <Popover
      popoverPadding="0"
      popoverPositionTop="2.5rem"
      popoverPositionRight="0">
      <Button
        slot="toggle"
        let:expanded
        let:toggle
        variant="outline"
        title="Share options"
        ariaLabel="Share options"
        stylePadding="0 0.5rem"
        styleBorderRadius="0 var(--border-radius-sm) var(--border-radius-sm) 0"
        on:click={toggle}>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} />
      </Button>

      <DropdownList slot="popover" items={actions}>
        <DropdownListItem
          slot="item"
          let:item
          selected={item.kind === selected.kind}
          title={item.tooltip}
          on:click={() => {
            $shareAction = item.kind;
            closeFocused();
            void run(item.kind);
          }}>
          <Icon name={item.icon} />
          {item.title}
        </DropdownListItem>
      </DropdownList>
    </Popover>
  </div>
</div>
