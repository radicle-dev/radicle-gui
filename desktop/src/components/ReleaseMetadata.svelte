<script lang="ts">
  import type { Release } from "@bindings/cob/release/Release";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import debounce from "lodash/debounce";

  import { writeToClipboard } from "@app/lib/invoke";
  import { routeToPath } from "@app/lib/router";
  import {
    absoluteTimestamp,
    authorForNodeId,
    formatOid,
    formatTimestamp,
  } from "@app/lib/utils";

  import DelegateBadge from "@app/components/DelegateBadge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";

  interface Props {
    release: Release;
    repo: RepoInfo;
    delegateIds: Set<string>;
  }

  const { release, repo, delegateIds }: Props = $props();

  let releaseIdCopied = $state(false);
  const resetReleaseIdCopied = debounce(() => {
    releaseIdCopied = false;
  }, 1000);
  async function copyReleaseId() {
    await writeToClipboard(release.id);
    releaseIdCopied = true;
    resetReleaseIdCopied();
  }
</script>

<style>
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .author-chip,
  .release-id-chip,
  .tag-chip,
  .commit-chip,
  .time-chip {
    display: inline-flex;
    align-items: center;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background-color: var(--color-surface-canvas);
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .author-chip {
    gap: 0.375rem;
  }
  .tag-chip,
  .time-chip {
    gap: 0.375rem;
  }
  .release-id-chip,
  .commit-chip {
    gap: 0.375rem;
    cursor: pointer;
    text-decoration: none;
  }
  .release-id-chip:hover,
  .release-id-chip:focus-visible,
  .commit-chip:hover,
  .commit-chip:focus-visible {
    background-color: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .rid-icon-value,
  .commit-value {
    font: var(--txt-code-regular);
  }
  .rid-icon-default,
  .rid-icon-hover {
    display: inline-flex;
    align-items: center;
  }
  .rid-icon-hover {
    display: none;
  }
  .release-id-chip:hover .rid-icon-default,
  .release-id-chip:focus-visible .rid-icon-default {
    display: none;
  }
  .release-id-chip:hover .rid-icon-hover,
  .release-id-chip:focus-visible .rid-icon-hover {
    display: inline-flex;
  }
</style>

<div class="meta-row">
  <div class="author-chip" title="Release creator">
    <NodeId {...authorForNodeId(release.creator)} />
    {#if delegateIds.has(release.creator.did)}
      <DelegateBadge />
    {/if}
  </div>

  <button
    type="button"
    class="release-id-chip"
    title={releaseIdCopied ? "Copied to clipboard" : "Copy release ID"}
    onclick={copyReleaseId}>
    {#if releaseIdCopied}
      <Icon name="checkmark" />
    {:else}
      <span class="rid-icon-default"><Icon name="hash" /></span>
      <span class="rid-icon-hover"><Icon name="copy" /></span>
    {/if}
    <span class="rid-icon-value">{formatOid(release.id)}</span>
  </button>

  {#if release.tagName}
    <span class="tag-chip" title="Tag this release was cut from">
      <Icon name="label" />
      <span>{release.tagName}</span>
    </span>
  {/if}

  <a
    class="commit-chip"
    title="Browse the released commit"
    href={routeToPath({
      resource: "repo.commit",
      rid: repo.rid,
      commit: release.oid,
    })}>
    <Icon name="commit" />
    <span class="commit-value">{formatOid(release.oid)}</span>
  </a>

  <span class="time-chip" title={absoluteTimestamp(release.createdAt)}>
    <Icon name="clock" />
    <span>Created {formatTimestamp(release.createdAt)}</span>
  </span>
</div>
