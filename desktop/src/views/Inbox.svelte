<script lang="ts">
  import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

  import { invoke } from "@app/lib/invoke";
  import {
    notificationCount,
    refreshNotificationCount,
  } from "@app/lib/notificationCount.svelte";
  import type { SidebarData } from "@app/lib/router/definitions";

  import InboxList from "@app/components/InboxList.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import Layout from "@app/views/repo/Layout.svelte";

  interface Props {
    sidebarData: SidebarData;
    notificationsByRepo: NotificationsByRepo[];
  }

  /* eslint-disable prefer-const */
  let { sidebarData, notificationsByRepo }: Props = $props();
  /* eslint-enable prefer-const */

  let newRowIds = $state<string[]>([]);

  $effect(() => {
    notificationCount.value = sidebarData.notificationCount;
  });

  async function clearAll() {
    try {
      await invoke("clear_notifications", { params: { type: "all" } });
    } finally {
      await refreshNotificationCount();
      await loadNotifications();
    }
  }

  async function clearByRepo(rid: string) {
    try {
      await invoke("clear_notifications", {
        params: { type: "repo", content: rid },
      });
    } finally {
      await refreshNotificationCount();
      await loadNotifications();
    }
  }

  async function clearByIds(ids: string[]) {
    try {
      await invoke("clear_notifications", {
        params: { type: "ids", content: ids },
      });
    } finally {
      await refreshNotificationCount();
      await loadNotifications();
    }
  }

  async function loadNotifications() {
    notificationsByRepo = await invoke<NotificationsByRepo[]>(
      "list_notifications",
      { params: { take: 100 } },
    );
  }

  function collectRowIds(repos: NotificationsByRepo[]): Set<string> {
    return new Set(
      repos.flatMap(repo => repo.notifications.flat().map(item => item.rowId)),
    );
  }

  // Whatever arrives that was not already on screen gets highlighted, so it is
  // obvious where the new notifications landed.
  async function loadNew() {
    const before = collectRowIds(notificationsByRepo);
    await loadNotifications();
    newRowIds = [...collectRowIds(notificationsByRepo)].filter(
      id => !before.has(id),
    );
  }

  async function loadMore(rid: string, take: number) {
    const page = await invoke<NotificationsByRepo[]>("list_notifications", {
      params: { repos: [rid], take },
    });
    notificationsByRepo = [
      ...notificationsByRepo.filter(r => r.rid !== rid),
      ...page,
    ];
  }
</script>

<style>
  .content {
    padding: 1rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }
  .inner {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .inbox-zero {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
</style>

<Layout selfScroll>
  {#if notificationCount.value === 0}
    <div class="inbox-zero">
      <div
        class="txt-missing txt-body-m-regular global-flex"
        style:gap="0.25rem">
        You're all caught up
      </div>
    </div>
  {:else}
    <ScrollArea
      style="height: 100%; width: 100%; background-color: var(--color-surface-canvas);">
      <div class="content">
        <div class="inner">
          <InboxList
            {clearAll}
            {clearByIds}
            {clearByRepo}
            {loadNew}
            {loadMore}
            {newRowIds}
            notificationCount={notificationCount.value}
            {notificationsByRepo} />
        </div>
      </div>
    </ScrollArea>
  {/if}
</Layout>
