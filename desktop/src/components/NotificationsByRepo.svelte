<script lang="ts">
  import type { NotificationsByRepo } from "@bindings/cob/inbox/NotificationsByRepo";

  import { preserveFocus } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import ConfirmClear from "@app/components/ConfirmClear.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NotificationTeaser from "@app/components/NotificationTeaser.svelte";

  interface Props {
    clearByIds: (ids: string[]) => Promise<void>;
    clearByRepo: (rid: string) => Promise<void>;
    count: number;
    excludeGroup?: (id: string) => void;
    groupedNotifications: NotificationsByRepo["notifications"];
    hidden: boolean;
    isFiltering?: boolean;
    name: string;
    pinned: boolean;
    rid: string;
    showAll: (rid: string) => Promise<void>;
    toggleHide: (rid: string) => void;
    togglePin: (rid: string) => void;
  }

  const {
    clearByIds,
    clearByRepo,
    count,
    excludeGroup,
    groupedNotifications,
    hidden,
    isFiltering = false,
    name,
    pinned,
    rid,
    showAll,
    toggleHide,
    togglePin,
  }: Props = $props();
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 2rem;
    gap: 0.75rem;
  }
  .container {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .action-buttons {
    display: flex;
    gap: 0.25rem;
    color: var(--color-text-tertiary);
  }
  .clear-repo {
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .action-buttons,
  .clear-repo {
    display: none;
  }
  .header:hover .action-buttons,
  .header:hover .clear-repo {
    display: flex;
  }
</style>

<div>
  <div
    class="header"
    class:txt-missing={hidden}
    style:margin-bottom={!hidden ? "1rem" : undefined}>
    <span class="txt-body-l-semibold">
      {name}
    </span>
    <span class="global-counter-badge">{count}</span>
    {#if !isFiltering}
      <div
        class="action-buttons"
        style:display={pinned || hidden ? "flex" : undefined}>
        {#if !hidden}
          <Button
            variant="naked"
            stylePadding="0 0.25rem"
            onclick={() => {
              togglePin(rid);
            }}>
            <Icon name={pinned ? "pin-filled" : "pin-hollow"} />
          </Button>
        {/if}
        {#if !pinned}
          <Button
            variant="naked"
            stylePadding="0 0.25rem"
            onclick={() => {
              toggleHide(rid);
            }}>
            <Icon name={hidden ? "eye-slash" : "eye"} />
          </Button>
        {/if}
      </div>
    {/if}
    {#if count > 0 && !hidden}
      <div class="clear-repo" use:preserveFocus>
        <ConfirmClear
          {count}
          clear={() => {
            void clearByRepo(rid);
          }} />
      </div>
    {/if}
  </div>

  {#if !hidden}
    <div class="container">
      {#if groupedNotifications.length > 0}
        {#each groupedNotifications as notificationGroup}
          <NotificationTeaser
            {clearByIds}
            {rid}
            kind={notificationGroup[0].type}
            oid={notificationGroup[0].id}
            notificationItems={notificationGroup}
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

    {#if !isFiltering && groupedNotifications.length > 0 && groupedNotifications.length < count}
      <div style:width="100%" style:margin-top="1rem">
        <div style:width="7rem" style:margin="auto">
          <Button
            variant="ghost"
            onclick={async () => {
              await showAll(rid);
            }}>
            <div style:width="100%" style:text-align="center">Show all</div>
          </Button>
        </div>
      </div>
    {/if}
  {/if}
</div>
