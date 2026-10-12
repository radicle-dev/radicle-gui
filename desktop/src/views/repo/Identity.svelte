<script lang="ts">
  import type { Identity } from "@bindings/identity/Identity";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { slide } from "svelte/transition";

  import { stateCaption, stateIcon } from "@app/lib/identityState";
  import type { SidebarData } from "@app/lib/router/definitions";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatTimestamp,
    pluralize,
  } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import IdentityChanges from "@app/components/IdentityChanges.svelte";
  import IdentityDocument from "@app/components/IdentityDocument.svelte";
  import IdentityJsonButton from "@app/components/IdentityJsonButton.svelte";
  import IdentityStateBadge from "@app/components/IdentityStateBadge.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import RepoHeader from "@app/components/RepoHeader.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    identity: Identity;
    sidebarData: SidebarData;
  }

  const { repo, identity, sidebarData }: Props = $props();

  const current = $derived(
    identity.revisions.find(r => r.id === identity.current),
  );

  let expandedId: string | undefined = $state();

  function toggle(id: string) {
    expandedId = expandedId === id ? undefined : id;
  }
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .content {
    max-width: 80rem;
    margin: 0 auto;
    padding: 1.5rem 6rem;
    min-width: 0;
  }
  .title {
    font: var(--txt-heading-m);
    color: var(--color-text-primary);
    margin: 0 0 1rem;
    min-width: 0;
  }
  .meta-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  /* RepoHeader has no bottom border of its own. */
  .repo-context {
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }
  .section-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 0 0.625rem;
    border-top: 1px solid var(--color-border-subtle);
  }
  .section-title {
    font: var(--txt-body-m-medium);
    color: var(--color-text-primary);
    margin: 0;
  }
  .section-note {
    margin-left: auto;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .timeline {
    position: relative;
    padding-bottom: 1rem;
  }
  /* Markers paint the canvas over the rail, so it reads as connecting them. */
  .timeline.has-runs::before {
    content: "";
    position: absolute;
    top: 1.25rem;
    bottom: 2rem;
    left: 1rem;
    width: 1px;
    background-color: var(--color-border-subtle);
    pointer-events: none;
    z-index: -1;
  }
  .timeline-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    min-height: 2.25rem;
    padding: 0.375rem 0.5rem;
    border: 0;
    background: none;
    text-align: left;
    color: inherit;
    cursor: pointer;
    font: var(--txt-body-m-regular);
  }
  .timeline-item .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    flex-shrink: 0;
    padding: 0.25rem 0;
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
  }
  .timeline-item .icon[data-state="accepted"] {
    color: var(--color-feedback-success-text);
  }
  .timeline-item .icon[data-state="rejected"] {
    color: var(--color-feedback-error-text);
  }
  .timeline-item:hover {
    background-color: var(--color-surface-subtle);
    border-radius: var(--border-radius-md);
  }
  .entry.open {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-canvas);
    margin: 0.5rem 0;
    overflow: hidden;
  }
  .entry.open .timeline-item {
    border-radius: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .timeline-item:hover .icon {
    background-color: var(--color-surface-subtle);
  }
  .icon-stack {
    display: grid;
    width: 1rem;
    place-items: center;
  }
  .icon-default,
  .icon-hover {
    grid-area: 1 / 1;
    transition:
      opacity 150ms ease,
      transform 150ms ease;
  }
  .icon-hover {
    opacity: 0;
    transform: rotate(-90deg);
  }
  .timeline-item:hover .icon-default,
  .timeline-item:focus-visible .icon-default {
    opacity: 0;
    transform: rotate(90deg);
  }
  .timeline-item:hover .icon-hover,
  .timeline-item:focus-visible .icon-hover {
    opacity: 1;
    transform: none;
  }
  .item-body {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1 1 0;
  }
  .item-title {
    color: var(--color-text-primary);
    min-width: 0;
  }
  .item-meta {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-shrink: 0;
  }
  .timestamp {
    color: var(--color-text-quaternary);
  }
  .current-marker {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0.125rem 0.375rem;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-brand-subtle);
    color: var(--color-text-brand);
  }
  /* Indented to line up with the row's text, clear of the rail marker:
     0.5rem row padding + 1rem marker + 0.625rem gap. */
  .detail {
    padding: 0.875rem 1rem 1rem 2.125rem;
  }
  .detail-section + .detail-section {
    margin-top: 1rem;
  }
  .detail-title {
    font: var(--txt-body-m-medium);
    color: var(--color-text-secondary);
    margin-bottom: 0.5rem;
  }
  .state-caption {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    margin-bottom: 0.75rem;
  }
  .signatures {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .signature {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .detail-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .detail-head .detail-title {
    margin-bottom: 0;
  }
  .detail-note {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .voters-note {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    margin-bottom: 0.5rem;
  }
  /* Markdown sets no base font and neither does `body`, so prose would fall
     back to the browser's default size instead of the app's. */
  .description {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .outcome {
    color: var(--color-text-secondary);
  }
  .pending-icon {
    color: var(--color-text-quaternary);
    display: inline-flex;
  }
  .accepted-icon {
    color: var(--color-feedback-success-text);
    display: inline-flex;
  }
  .rejected-icon {
    color: var(--color-feedback-error-text);
    display: inline-flex;
  }
  .detail-foot {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
</style>

<Layout selfScroll>
  <div class="page">
    <div class="repo-context">
      <RepoHeader {repo} config={sidebarData.config} />
    </div>

    <ScrollArea style="flex: 1; min-height: 0;">
      <div class="content">
        <h1 class="title">Identity document</h1>
        <div class="meta-bar">
          {#if current}
            <span>Current revision</span>
            <Id id={current.id} clipboard={current.id} label="revision ID" />
            <span title={absoluteTimestamp(current.timestamp)}>
              created {formatTimestamp(current.timestamp)}
            </span>
          {:else}
            <span>No accepted revision matches refs/rad/id</span>
          {/if}
        </div>

        <IdentityDocument
          doc={identity.doc}
          rid={identity.rid}
          revision={current} />

        <div class="section-head">
          <h2 class="section-title">History</h2>
          <span class="section-note">
            {identity.revisions.length}
            {pluralize("revision", identity.revisions.length)}
          </span>
        </div>

        <div class="timeline" class:has-runs={identity.revisions.length > 1}>
          {#each identity.revisions as rev (rev.id)}
            {@const open = expandedId === rev.id}
            <div class="entry" class:open>
              <button
                type="button"
                class="timeline-item"
                aria-expanded={open}
                onclick={() => toggle(rev.id)}>
                <span class="icon" data-state={rev.state.status}>
                  <span class="icon-stack">
                    <span class="icon-default">
                      <Icon name={stateIcon(rev.state)} />
                    </span>
                    <span class="icon-hover">
                      <Icon
                        name={open ? "collapse-vertical" : "expand-vertical"} />
                    </span>
                  </span>
                </span>
                <span class="item-body">
                  <NodeId {...authorForNodeId(rev.author)} />
                  <span class="item-title txt-overflow">{rev.title}</span>
                </span>
                <span class="item-meta">
                  {#if rev.id === identity.current}
                    <span class="current-marker txt-body-s-medium">
                      Current
                    </span>
                  {/if}
                  <span
                    class="timestamp"
                    title={absoluteTimestamp(rev.timestamp)}>
                    {formatTimestamp(rev.timestamp)}
                  </span>
                </span>
              </button>
              {#if open}
                {@const voters =
                  rev.accepted.length +
                  rev.rejected.length +
                  rev.pending.length}
                {@const caption = stateCaption(rev.state)}
                <div class="detail" transition:slide={{ duration: 180 }}>
                  {#if caption}
                    <div class="state-caption">{caption}</div>
                  {/if}

                  {#if rev.description}
                    <div class="detail-section">
                      <div class="detail-title">Description</div>
                      <div class="description">
                        <Markdown
                          breaks
                          content={rev.description}
                          rid={repo.rid} />
                      </div>
                    </div>
                  {/if}

                  <div class="detail-section">
                    <div class="detail-title">Changes</div>
                    <IdentityChanges changes={rev.changes} root={!rev.parent} />
                  </div>

                  <div class="detail-section">
                    <div class="detail-head">
                      <div class="detail-title">Signatures</div>
                      {#if rev.majority !== undefined}
                        <span class="detail-note">
                          {rev.accepted.length} of {voters}
                          {pluralize("delegate", voters)} signed, {rev.majority}
                          needed
                        </span>
                      {/if}
                    </div>
                    <div class="voters-note">
                      {#if rev.parent}
                        The delegates of the parent revision, whose votes decide
                        this one.
                      {:else}
                        The first revision is accepted when it is created, with
                        its author's signature.
                      {/if}
                    </div>
                    <div class="signatures">
                      {#each rev.accepted as delegate (delegate.did)}
                        <div class="signature">
                          <span class="accepted-icon">
                            <Icon name="checkmark" />
                          </span>
                          <NodeId {...authorForNodeId(delegate)} />
                          <span class="outcome">signed</span>
                        </div>
                      {/each}
                      {#each rev.rejected as delegate (delegate.did)}
                        <div class="signature">
                          <span class="rejected-icon">
                            <Icon name="close" />
                          </span>
                          <NodeId {...authorForNodeId(delegate)} />
                          <span class="outcome">rejected</span>
                        </div>
                      {/each}
                      {#each rev.pending as delegate (delegate.did)}
                        <div class="signature">
                          <span class="pending-icon">
                            <Icon name="minus" />
                          </span>
                          <NodeId {...authorForNodeId(delegate)} />
                          <span class="outcome">no verdict</span>
                        </div>
                      {/each}
                    </div>
                  </div>

                  <div class="detail-foot">
                    <IdentityStateBadge state={rev.state} />
                    <Id id={rev.id} clipboard={rev.id} label="revision ID" />
                    <span title={absoluteTimestamp(rev.timestamp)}>
                      {formatTimestamp(rev.timestamp)}
                    </span>
                    <IdentityJsonButton
                      raw={rev.raw}
                      revision={rev}
                      styleHeight="1.75rem" />
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </ScrollArea>
  </div>
</Layout>
