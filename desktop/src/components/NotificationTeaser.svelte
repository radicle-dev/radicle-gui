<script lang="ts">
  import type { NotificationItem } from "@bindings/cob/inbox/NotificationItem";

  import {
    compressActions,
    notificationActions,
    notificationIcon,
    notificationRoute,
    notificationStatusColor,
  } from "@app/lib/notification";
  import { push } from "@app/lib/router";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
    pluralize,
  } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import InlineTitle from "@app/components/InlineTitle.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import { closeFocused } from "@app/components/Popover.svelte";
  import { revealRepoInSidebar } from "@app/components/SidebarRepoList.svelte";

  interface Props {
    rid: string;
    kind: "issue" | "patch";
    oid: string;
    clearByIds: (ids: string[]) => Promise<void>;
    notificationItems: NotificationItem[];
    onExclude?: () => void;
    /** Newly arrived, so flash where it landed. */
    pulse?: boolean;
    selected?: boolean;
  }

  const {
    clearByIds,
    notificationItems,
    onExclude,
    pulse = false,
    rid,
    oid,
    kind,
    selected = false,
  }: Props = $props();

  const uniqueActions = $derived(
    compressActions(notificationActions(notificationItems), kind, oid),
  );

  // An object with months of unread activity summarizes into dozens of lines,
  // which would let one notification fill the whole inbox. The rest stay
  // accounted for in the count rather than being discarded.
  const maxActionLines = 4;

  const visibleActions = $derived(uniqueActions.slice(0, maxActionLines));
  const hiddenActionCount = $derived(
    Math.max(0, uniqueActions.length - maxActionLines),
  );

  const title = $derived.by(() => {
    const lastDetail = notificationItems.at(-1);
    if (lastDetail && "title" in lastDetail) {
      return lastDetail.title;
    }
  });

  const lastItem = $derived(notificationItems.at(-1));
  const icon = $derived(notificationIcon(lastItem));
  const statusColor = $derived(notificationStatusColor(lastItem));
  const route = $derived(notificationRoute(rid, lastItem));
</script>

<style>
  .notification-teaser {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    min-height: 5rem;
    padding: 1rem;
    cursor: pointer;
    font: var(--txt-body-l-regular);
    word-break: break-word;
  }
  .hover-actions {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    visibility: hidden;
    display: flex;
    gap: 0.25rem;
    color: var(--color-text-tertiary);
  }
  .notification-teaser:hover .hover-actions {
    visibility: visible;
  }
  .selected {
    background-color: var(--color-surface-mid);
  }
  /* N.b. the brand fill is used at its mid strength so the text stays
     readable through the flash. */
  @keyframes pulse-new {
    0%,
    100% {
      background-color: transparent;
    }
    50% {
      background-color: var(--color-surface-brand-mid);
    }
  }
  .pulse {
    animation: pulse-new 1s ease-in-out 3;
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
      background-color: var(--color-surface-brand-mid);
    }
  }
  .notification-teaser:hover {
    background-color: var(--color-surface-subtle);
  }
  .status {
    padding: 0;
    margin-right: 1rem;
  }
  .more-updates {
    color: var(--color-text-tertiary);
  }
  .notification-teaser:first-of-type {
    border-radius: var(--border-radius-sm) var(--border-radius-sm) 0 0;
  }
  .notification-teaser:last-of-type {
    border-radius: 0 0 var(--border-radius-sm) var(--border-radius-sm);
  }
  .notification-teaser:only-of-type {
    border-radius: var(--border-radius-sm);
  }
</style>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  tabindex="0"
  role="button"
  class:selected
  class:pulse
  class="notification-teaser"
  onclick={() => {
    if (route) {
      revealRepoInSidebar(rid);
      void push(route);
      closeFocused();
    }
  }}>
  <div class="global-flex" style:width="100%">
    <div
      class="global-chip status"
      style:align-self="flex-start"
      style:color={statusColor.color}
      style:background-color={statusColor.background}>
      <Icon name={icon} />
    </div>
    <div
      class="global-flex"
      style:flex-direction="column"
      style:align-items="flex-start"
      style:width="100%">
      {#if title}
        <InlineTitle content={title} />
      {/if}
      <div class="txt-body-m-regular" style:width="100%">
        {#each visibleActions as action}
          <div
            class="global-flex"
            style:gap="0.25rem"
            style:min-height="2rem"
            style:flex-wrap="wrap"
            style:width="100%">
            <NodeId {...authorForNodeId(action.items[0].author)} />
            <span>{@html action.summary}</span>
            <span
              style:margin-left="auto"
              style:color="var(--color-text-tertiary)"
              title={absoluteTimestamp(action.items[0].timestamp)}>
              {formatTimestamp(action.items[0].timestamp)}
            </span>
          </div>
        {/each}
        {#if hiddenActionCount > 0}
          <div class="more-updates global-flex" style:min-height="2rem">
            +{hiddenActionCount} older {pluralize("update", hiddenActionCount)}
          </div>
        {/if}
      </div>
    </div>
  </div>
  <div class="hover-actions">
    {#if onExclude}
      <Button
        variant="naked"
        styleWidth="2rem"
        stylePadding="0"
        title="Exclude from filter results"
        onclick={e => {
          e.stopPropagation();
          onExclude();
        }}>
        <Icon name="close" />
      </Button>
    {/if}
    <Button
      variant="naked"
      styleWidth="2rem"
      stylePadding="0"
      title="Delete"
      onclick={e => {
        e.stopPropagation();
        void clearByIds(notificationItems.map(n => n.rowId));
      }}>
      <Icon name="trash" />
    </Button>
  </div>
</div>
