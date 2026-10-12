<script lang="ts">
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import * as router from "@app/lib/router";
  import { authorForNodeId } from "@app/lib/utils";

  import CheckoutRepoButton from "@app/components/CheckoutRepoButton.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";
  import VisibilityBadge from "@app/components/VisibilityBadge.svelte";

  interface Props {
    repo: RepoInfo;
    config: Config;
  }

  const { repo, config }: Props = $props();

  const project = $derived(repo.payloads["xyz.radicle.project"]!);

  // The cards are portaled out of the stack, so moving onto one ends the
  // stack's hover. Keep it fanned out while any card is still open.
  let hovered = $state(false);
  const cardsOpen: Record<string, boolean> = $state({});
  const fanned = $derived(hovered || Object.values(cardsOpen).some(Boolean));
</script>

<style>
  .header {
    display: flex;
    align-items: center;
    flex-direction: row;
    gap: 1rem;
    padding: 0.625rem 1rem;
    flex-shrink: 0;
  }
  .project {
    flex: 1;
    min-width: 0;
  }
  .name {
    font: var(--txt-body-l-semibold);
    color: var(--color-text-primary);
  }
  .description {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-left: auto;
    flex-shrink: 0;
  }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
  }
  .delegates-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 1.75rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--border-radius-sm);
    background: none;
    font: inherit;
    cursor: pointer;
  }
  .delegates-button:hover,
  .delegates-button:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .meta-label {
    color: var(--color-text-secondary);
  }
  .meta-value {
    color: var(--color-text-primary);
  }
  .avatars {
    display: flex;
    align-items: center;
  }
  /* Positioned so each avatar paints together with its ring; otherwise every
     ring is painted before any image and the one below covers it. */
  .avatar {
    position: relative;
    display: flex;
    border-radius: 2px;
    box-shadow: 0 0 0 2px var(--color-surface-canvas);
    transition: margin-left 150ms ease;
  }
  .avatar + .avatar {
    margin-left: -0.625rem;
  }
  .avatars.fanned .avatar + .avatar {
    margin-left: 0.25rem;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
</style>

<div class="header">
  <div class="project txt-selectable">
    <div class="name txt-overflow">{project.data.name}</div>
    {#if project.data.description}
      <div class="description txt-overflow">{project.data.description}</div>
    {/if}
  </div>

  <div class="meta">
    <VisibilityBadge
      type={repo.visibility.type}
      seeded={repo.seeded}
      seeds={repo.seeding} />

    <div class="meta-item">
      <button
        type="button"
        class="delegates-button"
        title={`A commit becomes canonical once ${repo.threshold} of ${repo.delegates.length} delegates have the same commit on their ${project.data.defaultBranch} branch`}
        onclick={() =>
          router.push({ resource: "repo.identity", rid: repo.rid })}>
        <span class="meta-label">Delegates</span>
        <span class="meta-value">{repo.threshold}/{repo.delegates.length}</span>
      </button>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="avatars"
        class:fanned
        onmouseenter={() => (hovered = true)}
        onmouseleave={() => (hovered = false)}>
        {#each repo.delegates as delegate, index (delegate.did)}
          <div class="avatar" style:z-index={repo.delegates.length - index}>
            <NodeId
              {...authorForNodeId(delegate)}
              avatarOnly
              avatarSize="1.25rem"
              oncardtoggle={expanded => (cardsOpen[delegate.did] = expanded)} />
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="actions">
    <ShareButton
      target={{ type: "repo", rid: repo.rid }}
      id={repo.rid}
      idLabel="repository"
      variant="naked"
      {config} />
    <CheckoutRepoButton rid={repo.rid} />
  </div>
</div>
