<script lang="ts">
  import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

  import { keys } from "@radicle-gui/core/keys";
  import { onInvalidate } from "@radicle-gui/ui/lib/query.svelte";
  import { untrack } from "svelte";

  import { nodeEvents } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { latestOnly } from "@app/lib/latestOnly";
  import {
    notificationCount,
    refreshNotificationCount,
  } from "@app/lib/notificationCount.svelte";
  import { queryClient } from "@app/lib/query";
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

  $effect(() => {
    notificationCount.value = sidebarData.notificationCount;
  });

  async function clearAll() {
    await invoke("clear_notifications", { params: { type: "all" } });
  }

  async function clearByRepo(rid: string) {
    await invoke("clear_notifications", {
      params: { type: "repo", content: rid },
    });
  }

  async function clearByIds(ids: string[]) {
    await invoke("clear_notifications", {
      params: { type: "ids", content: ids },
    });
  }

  // Repos the user expanded with "Show all", which reloads keep expanded.
  let expanded: string[] = [];
  // Only the latest load applies, so that a reload started before a clear
  // can't bring back what the clear removed.
  const applyLatest = latestOnly<NotificationsByRepo[]>(list => {
    notificationsByRepo = list;
  });

  function loadNotifications() {
    return applyLatest(async () => {
      const [list, ...all] = await Promise.all([
        invoke<NotificationsByRepo[]>("list_notifications", {
          params: { take: 100 },
        }),
        ...expanded.map(rid =>
          invoke<NotificationsByRepo[]>("list_notifications", {
            params: { repos: [rid], all: true },
          }),
        ),
      ]);
      const full = new Map(all.flat().map(r => [r.rid, r]));
      return list.map(r => full.get(r.rid) ?? r);
    });
  }

  async function showAll(rid: string) {
    if (!expanded.includes(rid)) {
      expanded = [...expanded, rid];
    }
    await loadNotifications();
  }

  function loadedCount() {
    return notificationsByRepo.reduce((acc, r) => acc + r.count, 0);
  }

  // Follow notifications that arrive or are cleared elsewhere, such as by the
  // node or another instance of the app. The backend says when they change;
  // new activity on an issue or patch already in the inbox leaves the count
  // as it is.
  // The count is refreshed along with the list, since the one this view was
  // loaded with may be older than the list.
  onInvalidate(
    queryClient,
    () => keys.notificationList(),
    async () => {
      await loadNotifications();
      await refreshNotificationCount();
    },
  );
  // Without the backend's events, such as in the test backend, only the
  // polled count tells.
  $effect(() => {
    if ($nodeEvents) return;
    const count = notificationCount.value;
    if (count !== undefined && count !== untrack(loadedCount)) {
      void loadNotifications().catch(console.error);
    }
  });
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
    max-width: 75rem;
    margin: 0 auto;
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
            notificationCount={notificationCount.value}
            {notificationsByRepo}
            {showAll} />
        </div>
      </div>
    </ScrollArea>
  {/if}
</Layout>
