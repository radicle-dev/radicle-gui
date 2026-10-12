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
    selected?: boolean;
  }

  const {
    clearByIds,
    notificationItems,
    onExclude,
    rid,
    oid,
    kind,
    selected = false,
  }: Props = $props();

  const uniqueActions = $derived(
    compressActions(notificationActions(notificationItems), kind, oid),
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
    background-color: var(--color-surface-subtle);
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
  .notification-teaser:hover {
    background-color: var(--color-surface-mid);
  }
  .status {
    padding: 0;
    margin-right: 1rem;
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
        {#each uniqueActions as action}
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
      </div>
    </div>
  </div>
  <div class="hover-actions">
    {#if onExclude}
      <Button
        variant="naked"
        stylePadding="0 0.25rem"
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
      stylePadding="0 0.25rem"
      title="Delete"
      onclick={e => {
        e.stopPropagation();
        void clearByIds(notificationItems.map(n => n.rowId));
      }}>
      <Icon name="trash" />
    </Button>
  </div>
</div>
