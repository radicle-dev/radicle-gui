<script lang="ts">
  import type { Config } from "@bindings/config/Config";
  import type { Placement } from "@floating-ui/dom";
  import type { ComponentProps } from "svelte";

  import { cachedAlias, cachedConfig, writeToClipboard } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import { getPatchActivitySource } from "@app/lib/patchActivityContext";
  import { didFromPublicKey, pluralize, truncateId } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Popover from "@app/components/Popover.svelte";
  import UserAvatar from "@app/components/UserAvatar.svelte";

  type IconName = ComponentProps<typeof Icon>["name"];

  interface Props {
    publicKey: string;
    alias?: string;
    inline?: boolean;
    styleFont?: string;
    // Hides the alias; the card still shows it.
    avatarOnly?: boolean;
    avatarSize?: string;
    cardPlacement?: Placement;
    cardOffset?: number;
    oncardtoggle?: (expanded: boolean) => void;
  }

  const {
    publicKey,
    alias,
    inline = false,
    styleFont = undefined,
    avatarOnly = false,
    avatarSize = "1rem",
    cardPlacement = "bottom-start",
    cardOffset = undefined,
    oncardtoggle,
  }: Props = $props();

  let cardExpanded = $state(false);

  $effect(() => {
    oncardtoggle?.(cardExpanded);
  });

  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let copyIcon: "copy" | "checkmark" = $state("copy");
  let fetchedAlias: string | undefined = $state(undefined);
  let fetchedConfig: Config | undefined = $state(undefined);
  const did = $derived(didFromPublicKey(publicKey));
  const effectiveAlias = $derived(alias ?? fetchedAlias);
  const activitySource = getPatchActivitySource();
  // Only while the card is open. The figures are card-only, and resolving them
  // eagerly would have every `NodeId` on the page — of which there are many —
  // ask for repo-wide patch and issue lists it never renders.
  const activity = $derived(
    cardExpanded ? activitySource?.resolve(publicKey) : undefined,
  );

  $effect(() => {
    if (cardExpanded) activitySource?.prefetch();
  });

  $effect(() => {
    if (alias) return;
    let cancelled = false;
    void cachedAlias(publicKey)
      .then(result => {
        if (cancelled) return;
        if (result) fetchedAlias = result;
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  // Fetch the node config lazily when the card opens; it drives the explorer
  // profile link, which needs the configured `publicExplorer`.
  $effect(() => {
    if (!cardExpanded || fetchedConfig) return;
    let cancelled = false;
    void cachedConfig()
      .then(result => {
        if (!cancelled) fetchedConfig = result;
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  function openCard() {
    if (closeTimer) clearTimeout(closeTimer);
    if (cardExpanded) return;
    if (openTimer) clearTimeout(openTimer);
    openTimer = setTimeout(() => {
      cardExpanded = true;
    }, 200);
  }
  function scheduleClose() {
    if (openTimer) clearTimeout(openTimer);
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      cardExpanded = false;
    }, 150);
  }
  function cancelClose() {
    if (closeTimer) clearTimeout(closeTimer);
  }
  async function copyDid() {
    await writeToClipboard(did);
    copyIcon = "checkmark";
    setTimeout(() => (copyIcon = "copy"), 1000);
  }
</script>

<style>
  .avatar-alias {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font: var(--txt-body-m-regular);
  }
  .node-id-trigger {
    border-radius: var(--border-radius-sm);
  }
  .avatar-container {
    overflow: hidden;
    flex-shrink: 0;
  }
  .avatar-container :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .no-alias {
    color: var(--color-text-secondary);
  }
  .inline {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  .inline .alias {
    align-self: baseline;
  }
  .node-id-card {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0.875rem;
    min-width: 16rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    box-shadow: var(--elevation-low);
  }
  .node-id-card-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .node-id-card-avatar {
    width: 4rem;
    height: 4rem;
    overflow: hidden;
    flex-shrink: 0;
  }
  .node-id-card-avatar :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .node-id-card-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .node-id-card-activity-divider {
    height: 1px;
    background-color: var(--color-border-subtle);
    margin: 0.125rem 0;
  }
  .node-id-card-alias {
    color: var(--color-text-primary);
  }
  .node-id-card-did-row {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.25rem;
    margin-left: -0.25rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    cursor: pointer;
    width: fit-content;
  }
  .node-id-card-did-row:hover,
  .node-id-card-did-row:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .node-id-card-did-row:hover .node-id-card-did,
  .node-id-card-did-row:focus-visible .node-id-card-did,
  .node-id-card-did-row:hover .node-id-card-copy,
  .node-id-card-did-row:focus-visible .node-id-card-copy {
    color: var(--color-text-primary);
  }
  .node-id-card-did {
    color: var(--color-text-tertiary);
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New",
      monospace;
  }
  .node-id-card-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-tertiary);
  }
  .node-id-card-activity {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 0.875rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .node-id-card-activity-group {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .node-id-card-activity-heading {
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .node-id-card-activity-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-secondary);
  }
  .node-id-card-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .node-id-card-author-chip {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0.375rem 0.125rem 0.125rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
  }
  .node-id-card-actions {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .node-id-card-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: none;
  }
  .node-id-card-action:hover,
  .node-id-card-action:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
</style>

<Popover
  popoverPadding="0"
  placement={cardPlacement}
  offset={cardOffset}
  styleDisplay={inline ? "inline-flex" : undefined}
  bind:expanded={cardExpanded}>
  {#snippet toggle(_onclick)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="avatar-alias node-id-trigger"
      class:inline
      style:font={styleFont}
      onmouseenter={openCard}
      onmouseleave={scheduleClose}
      onfocusin={openCard}
      onfocusout={scheduleClose}>
      <div
        class="avatar-container"
        style:width={avatarSize}
        style:height={avatarSize}>
        <UserAvatar nodeId={publicKey} styleWidth={avatarSize} />
      </div>
      {#if !avatarOnly}
        {#if effectiveAlias}
          <span class="txt-overflow alias">
            {effectiveAlias}
          </span>
        {:else}
          <span class="no-alias">
            {truncateId(publicKey)}
          </span>
        {/if}
      {/if}
    </div>
  {/snippet}
  {#snippet popover()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="node-id-card"
      onmouseenter={cancelClose}
      onmouseleave={scheduleClose}>
      <div class="node-id-card-header">
        <div class="node-id-card-avatar">
          <UserAvatar nodeId={publicKey} styleWidth="4rem" />
        </div>
        <div class="node-id-card-text">
          {#if effectiveAlias}
            <div class="node-id-card-alias txt-body-m-medium">
              {effectiveAlias}
            </div>
          {:else}
            <div class="node-id-card-alias txt-body-m-medium">
              {truncateId(publicKey)}
            </div>
          {/if}
          {#if activity?.isAuthor || activity?.isDelegate}
            <div class="node-id-card-chips">
              {#if activity?.isAuthor}
                <div class="node-id-card-author-chip txt-body-s-medium">
                  <Icon name="patch" />
                  <span>Patch author</span>
                </div>
              {/if}
              {#if activity?.isDelegate}
                <div class="node-id-card-author-chip txt-body-s-medium">
                  <Icon name="badge" />
                  <span>Delegate</span>
                </div>
              {/if}
            </div>
          {/if}
          <button
            type="button"
            class="node-id-card-did-row"
            title="Copy DID"
            onclick={event => {
              event.stopPropagation();
              void copyDid();
            }}>
            <span class="node-id-card-did txt-body-s-regular">
              {truncateId(publicKey)}
            </span>
            <span class="node-id-card-copy">
              <Icon name={copyIcon} />
            </span>
          </button>
        </div>
      </div>
      {#if activity}
        {@const patchFacts = (
          [
            activity.revisionCount > 0
              ? {
                  icon: "revision" as IconName,
                  label: `${activity.revisionCount} ${pluralize("revision", activity.revisionCount)}`,
                }
              : undefined,
            activity.reviewCount > 0
              ? {
                  icon: "comment-checkmark" as IconName,
                  label: `${activity.reviewCount} ${pluralize("review", activity.reviewCount)}`,
                }
              : undefined,
            activity.commentCount > 0
              ? {
                  icon: "comment" as IconName,
                  label: `${activity.commentCount} ${pluralize("comment", activity.commentCount)}`,
                }
              : undefined,
          ] as ({ icon: IconName; label: string } | undefined)[]
        ).filter(
          (x): x is { icon: IconName; label: string } => x !== undefined,
        )}
        {@const repoFacts = (
          [
            activity.patchesAuthored > 0
              ? {
                  icon: "patch" as IconName,
                  label: `${activity.patchesAuthored} ${pluralize("patch", activity.patchesAuthored)}`,
                }
              : undefined,
            activity.issuesAuthored > 0
              ? {
                  icon: "issue" as IconName,
                  label: `${activity.issuesAuthored} ${pluralize("issue", activity.issuesAuthored)}`,
                }
              : undefined,
          ] as ({ icon: IconName; label: string } | undefined)[]
        ).filter(
          (x): x is { icon: IconName; label: string } => x !== undefined,
        )}
        {#if patchFacts.length > 0 || repoFacts.length > 0}
          <div class="node-id-card-activity">
            {#if patchFacts.length > 0}
              <div class="node-id-card-activity-group">
                <div class="node-id-card-activity-heading txt-body-s-medium">
                  On this patch
                </div>
                {#each patchFacts as item (item.label)}
                  <div class="node-id-card-activity-row txt-body-m-regular">
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </div>
                {/each}
              </div>
            {/if}
            {#if patchFacts.length > 0 && repoFacts.length > 0}
              <div class="node-id-card-activity-divider"></div>
            {/if}
            {#if repoFacts.length > 0}
              <div class="node-id-card-activity-group">
                <div class="node-id-card-activity-heading txt-body-s-medium">
                  In this repo
                </div>
                {#each repoFacts as item (item.label)}
                  <div class="node-id-card-activity-row txt-body-m-regular">
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
      <div class="node-id-card-actions">
        <a
          class="node-id-card-action txt-body-s-medium"
          href={fetchedConfig
            ? entityUrl({ type: "node", nid: publicKey }, fetchedConfig)
            : undefined}
          title="View profile on radicle.network"
          target="_blank"
          rel="noreferrer"
          onclick={event => event.stopPropagation()}>
          View profile
          <Icon name="open-external" />
        </a>
      </div>
    </div>
  {/snippet}
</Popover>
