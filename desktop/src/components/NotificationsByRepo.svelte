<script lang="ts">
  import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

  import { pluralize, preserveFocus } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import ConfirmClear from "@app/components/ConfirmClear.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NotificationTeaser from "@app/components/NotificationTeaser.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";

  interface Props {
    clearByIds: (ids: string[]) => Promise<void>;
    clearByRepo: (rid: string) => Promise<void>;
    count: number;
    excludeGroup?: (id: string) => void;
    groupedNotifications: NotificationsByRepo["notifications"];
    hidden: boolean;
    isFiltering?: boolean;
    loadMore: (rid: string, take: number) => Promise<void>;
    name: string;
    newRowIds: string[];
    rid: string;
    toggleHide: (rid: string) => void;
  }

  const {
    clearByIds,
    clearByRepo,
    count,
    excludeGroup,
    groupedNotifications,
    hidden,
    isFiltering = false,
    loadMore,
    name,
    newRowIds,
    rid,
    toggleHide,
  }: Props = $props();

  // How many notifications a repository shows before you ask for more, and how
  // many each further press reveals. Paging keeps a repository with hundreds of
  // notifications from dumping all of them at once.
  const previewCount = 3;
  const pageSize = 10;

  let shown = $state(previewCount);
  let loading = $state(false);

  const truncated = $derived(groupedNotifications.length < count);
  const newRowIdSet = $derived(new Set(newRowIds));

  const visibleGroups = $derived(
    isFiltering ? groupedNotifications : groupedNotifications.slice(0, shown),
  );

  const remaining = $derived(Math.max(0, count - visibleGroups.length));
  const hasMore = $derived(!isFiltering && remaining > 0);

  // One notification past the cut is rendered under the fade, so the list
  // visibly continues behind it rather than stopping dead.
  const peekGroup = $derived(
    isFiltering ? undefined : groupedNotifications[shown],
  );

  async function showMore() {
    const next = shown + pageSize;
    shown = next;
    // Only the first page is fetched up front, so reach for the rest lazily.
    if (next > groupedNotifications.length && truncated) {
      try {
        loading = true;
        await loadMore(rid, next);
      } finally {
        loading = false;
      }
    }
  }

  function isNew(group: NotificationsByRepo["notifications"][number]) {
    return group.some(item => newRowIdSet.has(item.rowId));
  }
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 2rem;
    gap: 0.5rem;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .container {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 1rem;
  }
  .action-buttons {
    display: flex;
    gap: 0.25rem;
    color: var(--color-text-tertiary);
  }
  .clear-repo {
    color: var(--color-text-tertiary);
  }
  .spacer {
    margin-left: auto;
  }
  .action-buttons,
  .clear-repo {
    display: none;
  }
  .header:hover .action-buttons,
  .header:hover .clear-repo {
    display: flex;
  }
  .peek {
    position: relative;
    margin-top: 1px;
  }
  .peek.empty {
    min-height: 4rem;
  }
  /* Purely a glimpse of what is next; the button above it takes the clicks. */
  .peek-list {
    pointer-events: none;
    user-select: none;
  }
  .fade {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      var(--color-surface-canvas) 75%
    );
  }
</style>

<div>
  <div class="header" class:txt-missing={hidden}>
    <div class="name">
      <RepoAvatar {name} {rid} styleWidth="1.25rem" />
      <span class="txt-body-l-semibold">{name}</span>
    </div>

    {#if !isFiltering}
      <div class="action-buttons" style:display={hidden ? "flex" : undefined}>
        <Button
          variant="naked"
          styleWidth="2rem"
          stylePadding="0"
          title={hidden
            ? `Stop hiding ${name} in the inbox`
            : `Hide ${name} at the bottom of the inbox`}
          onclick={() => {
            toggleHide(rid);
          }}>
          <Icon name={hidden ? "eye-slash" : "eye"} />
        </Button>
      </div>
    {/if}

    {#if count > 0 && !hidden}
      <div class="clear-repo" use:preserveFocus>
        <ConfirmClear
          {count}
          icon="trash"
          matching={isFiltering}
          clear={() => {
            void clearByRepo(rid);
          }} />
      </div>
    {/if}

    <div class="spacer"></div>
  </div>

  {#if !hidden}
    <div class="container">
      {#if visibleGroups.length > 0}
        {#each visibleGroups as notificationGroup}
          <NotificationTeaser
            {clearByIds}
            {rid}
            kind={notificationGroup[0].type}
            oid={notificationGroup[0].id}
            notificationItems={notificationGroup}
            pulse={isNew(notificationGroup)}
            onExclude={excludeGroup
              ? () => excludeGroup(notificationGroup[0].id)
              : undefined} />
        {/each}
      {:else}
        <div
          class="global-flex"
          style:height="100%"
          style:align-items="center"
          style:justify-content="center">
          <div
            class="txt-missing txt-body-m-regular global-flex"
            style:gap="0.25rem">
            <Icon name="none" />
            No notifications.
          </div>
        </div>
      {/if}
    </div>

    {#if hasMore}
      <div class="peek" class:empty={peekGroup === undefined}>
        {#if peekGroup}
          <div class="peek-list">
            <NotificationTeaser
              {clearByIds}
              {rid}
              kind={peekGroup[0].type}
              oid={peekGroup[0].id}
              notificationItems={peekGroup} />
          </div>
        {/if}
        <div class="fade">
          <Button
            variant="outline"
            disabled={loading}
            title={`Show ${Math.min(pageSize, remaining)} more ${pluralize("notification", Math.min(pageSize, remaining))} from ${name}`}
            onclick={() => {
              void showMore();
            }}>
            {#if loading}
              Loading…
            {:else}
              Show more
              <span class="global-counter-badge">{remaining}</span>
            {/if}
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</div>
