<script lang="ts">
  import type { ComponentProps } from "svelte";
  import type { ShareAction } from "@app/lib/shareAction";

  import config from "@app/lib/config";
  import debounce from "lodash/debounce";
  import { onDestroy } from "svelte";
  import { shareAction } from "@app/lib/shareAction";
  import { toClipboard } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownList/DropdownListItem.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Link from "@app/components/Link.svelte";
  import Popover, { closeFocused } from "@app/components/Popover.svelte";

  // Canonical RID, never the URL's alias segment. It and `id` come from the
  // seed, so they are validated before we navigate to or copy them.
  export let rid: string;
  export let resource: string | undefined = undefined;
  export let id: string;
  export let idLabel: string;
  export let path: string | undefined = undefined;

  const origin = new URL(config.nodes.fallbackPublicExplorer).origin;
  const host = new URL(origin).host;

  // Same grammar as desktop's `radUri.ts`.
  const ridPattern = /^rad:z[1-9A-HJ-NP-Za-km-z]{27,28}$/;
  const oidPattern = /^[0-9a-f]{40}$/;
  const resourcePattern = /^(commit|cob\/[a-z0-9.]+)\/[0-9a-f]{40}$/;

  $: uri = resource ? `${rid}/${resource}` : rid;
  $: validUri =
    ridPattern.test(rid) &&
    (resource === undefined || resourcePattern.test(resource));
  $: validId = ridPattern.test(id) || oidPattern.test(id);

  $: actions = (
    [
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
    }[]
  ).filter(a => {
    if (a.kind === "openInApp") return validUri;
    if (a.kind === "copyId") return validId;
    // Without a resource the URI is just the RID, i.e. the same as Copy ID.
    if (a.kind === "copyUri") return validUri && resource !== undefined;
    return true;
  });

  $: selected =
    actions.find(a => a.kind === $shareAction) ??
    actions.find(a => a.kind === "copyLink") ??
    actions[0];

  let copied = false;
  const restore = debounce(() => {
    copied = false;
  }, 1000);

  let notice = false;
  let container: HTMLDivElement;
  let pendingNotice: ReturnType<typeof setTimeout> | undefined = undefined;

  function hideNotice() {
    clearTimeout(pendingNotice);
    pendingNotice = undefined;
    notice = false;
  }

  function onLeave() {
    if (pendingNotice !== undefined) hideNotice();
  }

  function reset() {
    hideNotice();
    restore.cancel();
    copied = false;
  }

  // The same instance is reused when navigating between resources.
  // Passing `uri` makes the statement rerun when it changes.
  $: resetFor(uri);
  function resetFor(_uri: string) {
    reset();
  }

  function openInApp() {
    hideNotice();
    if (!validUri) return;
    // Start the timer first: some browsers throw on an unknown scheme, and
    // then the notice is exactly what we want to show.
    pendingNotice = setTimeout(() => {
      pendingNotice = undefined;
      notice = document.hasFocus();
    }, 1000);
    try {
      window.location.assign(uri);
    } catch {
      // Handled by the notice.
    }
  }

  onDestroy(reset);

  function dismissOutside(event: MouseEvent | TouchEvent) {
    if (!event.composedPath().includes(container)) hideNotice();
  }

  async function run(kind: ShareAction) {
    if (kind === "openInApp") {
      openInApp();
      return;
    }
    hideNotice();
    try {
      await toClipboard(
        kind === "copyLink"
          ? origin.concat(path ?? window.location.pathname)
          : kind === "copyUri"
            ? uri
            : id,
      );
    } catch {
      return;
    }
    copied = true;
    restore();
  }
</script>

<style>
  .split {
    display: inline-flex;
    position: relative;
  }
  .notice {
    position: absolute;
    top: 2.5rem;
    right: 0;
    z-index: 10;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    width: max-content;
    max-width: 18rem;
    padding: 0.75rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-low);
    font: var(--txt-body-m-regular);
  }
  .notice-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
  .notice-link {
    text-decoration: underline;
  }
  .toggle {
    margin-left: -1px;
  }
</style>

<svelte:document on:visibilitychange={onLeave} />

<svelte:window
  on:blur={onLeave}
  on:click={dismissOutside}
  on:touchstart={dismissOutside}
  on:keydown={event => {
    if (event.key === "Escape") hideNotice();
  }} />

<div class="split" bind:this={container}>
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
        on:click={() => {
          hideNotice();
          toggle();
        }}>
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

  {#if notice}
    <div class="notice" role="status">
      <div class="notice-text">
        <span>Opening in app. Didn't open?</span>
        <Link
          route={{ resource: "desktop", params: undefined }}
          on:afterNavigate={() => (notice = false)}>
          <span class="notice-link">Get Radicle Desktop</span>
        </Link>
      </div>
      <IconButton ariaLabel="Dismiss" on:click={() => (notice = false)}>
        <Icon name="close" />
      </IconButton>
    </div>
  {/if}
</div>
