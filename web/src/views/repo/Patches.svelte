<script lang="ts">
  import type { Patch, Repo } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { diffSnapshots, diffStats } from "@app/node/diff";
  import { timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Icon from "@app/components/Icon.svelte";
  import LabelChip from "@app/components/LabelChip.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";
  import StateIcon from "@app/components/StateIcon.svelte";
  import SideSheet from "@app/components/SideSheet.svelte";
  import PatchView from "./Patch.svelte";

  interface Props {
    repo: Repo;
    filter: string;
    peek?: string;
  }

  const { repo, filter, peek }: Props = $props();

  function listHref(id?: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one call, never reactive
    const q = new URLSearchParams();
    if (filter !== "open") q.set("state", filter);
    if (id) q.set("peek", id);
    const qs = q.toString();
    return `${base}/patches${qs ? `?${qs}` : ""}`;
  }

  function openPeek(e: MouseEvent, id: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(listHref(id), { scroll: false });
  }

  let query = $state("");
  const base = $derived(node.repoPath(repo));
  const counts = $derived({
    open: repo.patches.filter(p => p.state === "open").length,
    draft: repo.patches.filter(p => p.state === "draft").length,
    merged: repo.patches.filter(p => p.state === "merged").length,
    archived: repo.patches.filter(p => p.state === "archived").length,
  });
  const shown = $derived(
    repo.patches
      .filter(p => p.state === filter || (filter === "open" && p.state === "open"))
      .filter(p => !query || p.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => activity(b) - activity(a)),
  );

  function activity(p: Patch) {
    return Math.max(
      p.time,
      ...p.revisions.flatMap(r => [r.time, ...r.reviews.map(v => v.time), ...r.comments.map(c => c.time)]),
    );
  }

  function stats(p: Patch) {
    const rev = node.latestRevision(p);
    return diffStats(diffSnapshots(repo.snapshots[rev.base] ?? {}, repo.snapshots[rev.head] ?? {}));
  }

  function verdicts(p: Patch) {
    const rev = node.latestRevision(p);
    return rev.reviews.filter(r => r.verdict);
  }
</script>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .search {
    flex: 1;
    min-width: 12rem;
    max-width: 24rem;
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    text-decoration: none;
    color: inherit;
  }
  .item:last-child {
    border-bottom: none;
  }
  .item:hover {
    background: var(--color-surface-base);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .title {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    font: var(--txt-body-m-semibold);
  }
  .meta {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .side {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
    white-space: nowrap;
  }
  .verdict {
    position: relative;
    display: inline-flex;
  }
  .verdict .mark {
    position: absolute;
    right: -0.25rem;
    bottom: -0.25rem;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    border: 2px solid var(--color-surface-canvas);
  }
  .add {
    color: var(--color-feedback-success-text);
  }
  .del {
    color: var(--color-feedback-error-text);
  }
  .item.peeked {
    background: var(--color-surface-subtle);
  }
</style>

<div class="bar">
  <SegmentedSwitch
    options={[
      { value: "open", label: `${counts.open} Open` },
      { value: "draft", label: `${counts.draft} Draft` },
      { value: "merged", label: `${counts.merged} Merged` },
      { value: "archived", label: `${counts.archived} Archived` },
    ]}
    value={["open", "draft", "merged", "archived"].includes(filter) ? (filter as "open") : "open"}
    onchange={v => navigate(`${base}/patches${v === "open" ? "" : `?state=${v}`}`)} />
  <input class="input search" bind:value={query} placeholder="Filter patches" />
</div>

<div class="card">
  {#each shown as patch (patch.id)}
    {@const s = stats(patch)}
    <a
      class="item"
      class:peeked={peek === patch.id}
      href={`${base}/patches/${patch.id}`}
      data-peek
      onclick={e => openPeek(e, patch.id)}>
      <span style="padding-top: 0.125rem;"><StateIcon kind="patch" state={patch.state} /></span>
      <div class="body">
        <div class="title">
          {patch.title}
          {#each patch.labels as l (l)}<LabelChip label={l} />{/each}
        </div>
        <div class="meta">
          {node.person(patch.author).alias} opened {timeAgo(patch.time)}
          {#if patch.revisions.length > 1}· {patch.revisions.length} revisions{/if}
          {#if patch.state === "merged" && patch.mergedAt}· merged {timeAgo(patch.mergedAt)}{/if}
        </div>
      </div>
      <div class="side">
        {#each verdicts(patch) as review (review.id)}
          <span class="verdict" title={`${node.person(review.author).alias} ${review.verdict === "accept" ? "accepted" : "requested changes"}`}>
            <Avatar person={review.author} size="1.25rem" />
            <span
              class="mark"
              style:background={review.verdict === "accept"
                ? "var(--color-feedback-success-fill)"
                : "var(--color-feedback-error-fill)"}></span>
          </span>
        {/each}
        <span><span class="add">+{s.additions}</span> <span class="del">−{s.deletions}</span></span>
        {#if patch.revisions.reduce((n, r) => n + r.comments.length, 0) > 0}
          <span class="row" style="gap: 0.25rem;">
            <Icon name="comment" />{patch.revisions.reduce((n, r) => n + r.comments.length, 0)}
          </span>
        {/if}
      </div>
    </a>
  {:else}
    <Empty icon="patch" title={`No ${filter} patches`}>
      Patches are proposed changes. Push one with <span class="mono">git push rad HEAD:refs/patches</span>.
    </Empty>
  {/each}
</div>

{#if peek}
  <SideSheet expandHref={`${base}/patches/${peek}`} onClose={() => navigate(listHref(), { scroll: false })}>
    <PatchView {repo} id={peek} view="activity" />
  </SideSheet>
{/if}
