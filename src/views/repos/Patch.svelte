<script lang="ts" context="module">
  import type {
    Author,
    Comment,
    Review,
    Merge,
    Patch,
    Repo,
    Revision,
    Diff,
  } from "@http-client";

  import * as utils from "@app/lib/utils";

  interface Thread {
    root: Comment;
    replies: Comment[];
  }

  interface ReviewWithThreads extends Review {
    threads: Thread[];
  }

  interface TimelineReview {
    inner: [string, ReviewWithThreads];
    type: "review";
    timestamp: number;
  }

  interface TimelineMerge {
    inner: Merge;
    type: "merge";
    timestamp: number;
  }

  interface TimelineThread {
    inner: Thread;
    type: "thread";
    timestamp: number;
  }

  export type Timeline = TimelineMerge | TimelineReview | TimelineThread;
  export type PatchReviews = Record<
    string,
    { latest: boolean; review: Review }
  >;

  // The branch a patch is opened against, unqualified. The `delegates` target
  // leaves the repository default implied.
  function resolveTargetBranch(patch: Patch, repo: Repo): string | undefined {
    if (patch.target !== "delegates") {
      return utils.unqualifyBranch(patch.target.branch);
    }

    return repo.defaultBranch
      ? utils.unqualifyBranch(repo.defaultBranch)
      : undefined;
  }

  // Nothing validates a patch's target when it is opened, so it can name a
  // branch that is not a canonical reference. The source view cannot resolve
  // such a branch, so it is shown without a link rather than one that errors.
  function isBrowsableBranch(branch: string, repo: Repo): boolean {
    return (
      `${utils.REFS_HEADS}${branch}` === repo.defaultBranch ||
      repo.refs?.refs[`${utils.REFS_HEADS}${branch}`] !== undefined
    );
  }
</script>

<script lang="ts">
  import type { BaseUrl } from "@http-client";
  import type { PatchView } from "./router";
  import type { Route } from "@app/lib/router";
  import type { ComponentProps } from "svelte";

  import capitalize from "lodash/capitalize";
  import uniqBy from "lodash/uniqBy";

  import Badge from "@app/components/Badge.svelte";
  import Button from "@app/components/Button.svelte";
  import Changeset from "@app/views/repos/Changeset.svelte";
  import CheckoutButton from "@app/views/repos/Patch/CheckoutButton.svelte";
  import CobHeader from "@app/views/repos/Cob/CobHeader.svelte";
  import CompareButton from "@app/views/repos/Patch/CompareButton.svelte";
  import DiffStatBadge from "@app/components/DiffStatBadge.svelte";
  import Embeds from "@app/views/repos/Cob/Embeds.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Labels from "@app/views/repos/Cob/Labels.svelte";
  import Layout from "@app/views/repos/Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Placeholder from "@app/components/Placeholder.svelte";

  import Reactions from "@app/components/Reactions.svelte";
  import Reviews from "@app/views/repos/Cob/Reviews.svelte";
  import RevisionComponent from "@app/views/repos/Cob/Revision.svelte";
  import RevisionSelector from "@app/views/repos/Patch/RevisionSelector.svelte";
  import Separator from "./Separator.svelte";
  import Share from "@app/views/repos/Share.svelte";

  export let baseUrl: BaseUrl;
  export let patch: Patch;
  export let stats: Diff["stats"];
  export let rawPath: (commit?: string) => string;
  export let repo: Repo;
  export let repoId: string;
  export let view: PatchView;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  const patchStatusLabel: Record<Patch["state"]["status"], string> = {
    draft: "Draft Patches",
    open: "Open Patches",
    archived: "Archived Patches",
    merged: "Merged Patches",
  };

  function badgeColor(status: string): ComponentProps<Badge>["variant"] {
    if (status === "draft") {
      return "draft";
    } else if (status === "open") {
      return "open";
    } else if (status === "archived") {
      return "archived";
    } else if (status === "merged") {
      return "merged";
    } else {
      return "draft";
    }
  }

  type Tab = "activity" | "changes";

  let tabs: Record<Tab, { icon: ComponentProps<Icon>["name"]; route: Route }>;
  $: {
    const baseRoute = {
      resource: "repo.patch",
      repo: repoId,
      node: baseUrl,
      patch: patch.id,
    } as const;
    // For cleaner URLs, we omit the revision part when we link to the
    // latest revision.
    const latestRevisionId = patch.revisions[patch.revisions.length - 1].id;
    const revision = latestRevisionId === revisionId ? undefined : revisionId;
    tabs = {
      activity: {
        route: {
          ...baseRoute,
          view: { name: "activity" },
        },
        icon: "activity",
      },
      changes: {
        route: {
          ...baseRoute,
          view: { name: "changes", revision },
        },
        icon: "diff",
      },
    };
  }

  function computeReviews(patch: Patch) {
    const patchReviews: Record<string, { latest: boolean; review: Review }> =
      {};

    patch.revisions.forEach((rev, i) => {
      const latest = i === patch.revisions.length - 1;
      for (const review of rev.reviews) {
        patchReviews[review.author.id] = { latest, review };
      }
    });

    return patchReviews;
  }

  // eslint-disable-next-line no-useless-assignment
  $: revisionId =
    view.name === "diff"
      ? patch.revisions[patch.revisions.length - 1].id
      : view.revision;

  $: uniqueEmbeds = uniqBy(
    patch.revisions.flatMap(({ discussions }) =>
      discussions.flatMap(comment => comment.embeds),
    ),
    "content",
  );
  $: description = patch.revisions[0].description;
  $: lastEdit = patch.revisions[0].edits.at(-1);
  $: reviews = computeReviews(patch);
  $: timelineTuple = patch.revisions.map<
    [
      {
        revisionId: string;
        revisionTimestamp: number;
        revisionBase: string;
        revisionOid: string;
        revisionEdits: Revision["edits"];
        revisionReactions: Revision["reactions"];
        revisionAuthor: Author;
        revisionDescription: string;
      },
      Timeline[],
    ]
  >(rev => [
    {
      revisionId: rev.id,
      revisionTimestamp: rev.timestamp,
      revisionBase: rev.base,
      revisionOid: rev.oid,
      revisionEdits: rev.edits,
      revisionReactions: rev.reactions,
      revisionAuthor: rev.author,
      revisionDescription: rev.description,
    },
    [
      ...rev.reviews.map<TimelineReview>(review => {
        const reviewThreads: Thread[] = review.comments
          .filter(comment => !comment.replyTo)
          .map(thread => ({
            root: thread,
            replies: review.comments
              .filter(comment => comment.replyTo === thread.id)
              .sort((a, b) => a.timestamp - b.timestamp),
          }));
        return {
          timestamp: review.timestamp,
          type: "review",
          inner: [review.author.id, { ...review, threads: reviewThreads }],
        };
      }),
      ...patch.merges
        .filter(merge => merge.revision === rev.id)
        .map<TimelineMerge>(inner => ({
          timestamp: inner.timestamp,
          type: "merge",
          inner,
        })),
      ...rev.discussions
        .filter(comment => !comment.replyTo)
        .map<TimelineThread>(thread => ({
          timestamp: thread.timestamp,
          type: "thread",
          inner: {
            root: thread,
            replies: rev.discussions
              .filter(comment => comment.replyTo === thread.id)
              .sort((a, b) => a.timestamp - b.timestamp),
          },
        })),
    ].sort((a, b) => a.timestamp - b.timestamp),
  ]);
  $: targetBranch = resolveTargetBranch(patch, repo);
  $: targetBranchCaption = `This patch merges into ${targetBranch}`;
  $: targetBranchBrowsable =
    targetBranch !== undefined && isBrowsableBranch(targetBranch, repo);
  $: firstRevision = timelineTuple[0][0];
  $: latestRevision = patch.revisions[patch.revisions.length - 1];
</script>

<style>
  .patch {
    display: flex;
    flex: 1;
    min-height: 100%;
  }
  .main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    background-color: var(--color-surface-canvas);
  }
  .metadata {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    font: var(--txt-body-m-regular);
    padding: 1rem;
    border-left: 1px solid var(--color-border-subtle);
    width: 20rem;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-heading-l);
    word-break: break-word;
  }
  .bottom {
    background-color: var(--color-surface-base);
    padding: 1rem 1rem 0.5rem 1rem;
    height: 100%;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
    padding: 1rem;
    border-top: 1px solid var(--color-border-subtle);
    border-bottom: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-base);
  }
  .author-metadata {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .code-chip {
    display: inline-flex;
  }
  .code-chip > :global(*) {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-code-regular);
    color: var(--color-text-tertiary);
    background-color: var(--color-surface-alpha-subtle);
    border-radius: var(--border-radius-sm);
    padding: 0 0.25rem;
  }
  .revision-description {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }
  @media (max-width: 719.98px) {
    .patch {
      display: block;
    }
    .bottom {
      padding: 1rem 0 0 0;
    }
  }
</style>

<Layout
  {baseUrl}
  {repo}
  {repoId}
  {nodeId}
  {nodeAvatarUrl}
  activeTab="patches"
  stylePaddingBottom="0">
  <svelte:fragment slot="breadcrumb">
    <Separator />
    <Link
      route={{
        resource: "repo.patches",
        repo: repoId,
        node: baseUrl,
        search: `status=${patch.state.status}`,
      }}>
      {patchStatusLabel[patch.state.status]}
    </Link>
    <Separator />
    <span class="txt-id">
      <div class="global-hide-on-small-desktop-down">
        {patch.id}
      </div>
      <div class="global-hide-on-medium-desktop-up">
        {utils.formatObjectId(patch.id)}
      </div>
    </span>
  </svelte:fragment>
  <div class="patch">
    <div class="main">
      <CobHeader>
        <svelte:fragment slot="title">
          {#if patch.title}
            <div class="title">
              <InlineTitle fontSize="heading-l" content={patch.title} />
            </div>
          {:else}
            <span style:color="var(--color-text-tertiary)">No title</span>
          {/if}
          <div class="global-flex-item">
            <Share />
            <div class="global-hide-on-mobile-down">
              <CheckoutButton id={patch.id} />
            </div>
          </div>
        </svelte:fragment>
        <svelte:fragment slot="state">
          <Badge size="tiny" variant={badgeColor(patch.state.status)}>
            <Icon
              name={patch.state.status === "draft"
                ? "patch-draft"
                : patch.state.status === "merged"
                  ? "patch-merged"
                  : patch.state.status === "archived"
                    ? "patch-archived"
                    : "patch"} />
            {capitalize(patch.state.status)}
          </Badge>
          <Link
            route={{
              resource: "repo.patch",
              repo: repoId,
              node: baseUrl,
              patch: patch.id,
              view: { name: "changes", revision: latestRevision.id },
            }}>
            <DiffStatBadge
              hoverable
              insertions={stats.insertions}
              deletions={stats.deletions} />
          </Link>
          <NodeId
            {baseUrl}
            nodeId={patch.author.id}
            alias={patch.author.alias} />
          opened
          <span class="code-chip">
            <Id id={patch.id} />
          </span>
          <!-- A `delegates` target implies the repository default, which a
          repo without a default branch cannot name. -->
          {#if targetBranch}
            <span class="global-flex-item" title={targetBranchCaption}>
              <Icon name="arrow-right" />
            </span>
            <span class="code-chip">
              {#if targetBranchBrowsable}
                <Link
                  styleHoverState
                  title={targetBranchCaption}
                  route={{
                    resource: "repo.source",
                    repo: repoId,
                    node: baseUrl,
                    revision: targetBranch,
                  }}>
                  <Icon name="branch" />
                  <span class="txt-overflow">{targetBranch}</span>
                </Link>
              {:else}
                <span title={targetBranchCaption}>
                  <Icon name="branch" />
                  <span class="txt-overflow">{targetBranch}</span>
                </span>
              {/if}
            </span>
          {/if}
          <span title={utils.absoluteTimestamp(patch.revisions[0].timestamp)}>
            {utils.formatTimestamp(patch.revisions[0].timestamp)}
          </span>
          {#if patch.revisions[0].edits.length > 1 && lastEdit}
            <div
              class="author-metadata"
              title={utils.formatEditedCaption(
                lastEdit.author,
                lastEdit.timestamp,
              )}>
              • edited
            </div>
          {/if}
        </svelte:fragment>
        <div slot="subtitle" class="global-hide-on-desktop-up">
          <div
            style:margin-top="2rem"
            style="display: flex; flex-direction: column; gap: 0.5rem;">
            <Reviews {baseUrl} {reviews} />
            <Labels labels={patch.labels} />
            <Embeds embeds={uniqueEmbeds} />
          </div>
        </div>
        <svelte:fragment slot="description">
          <div class="revision-description">
            {#if description}
              <Markdown
                breaks
                content={description}
                rawPath={rawPath(patch.id)} />
            {:else}
              <span style:color="var(--color-text-tertiary)">
                No description available
              </span>
            {/if}
            {#if firstRevision.revisionReactions.length > 0}
              <Reactions reactions={firstRevision.revisionReactions} />
            {/if}
          </div>
        </svelte:fragment>
      </CobHeader>

      <div class="tabs">
        {#each Object.entries(tabs) as [name, { route, icon }]}
          <Link {route}>
            <Button
              variant={name === view.name ||
              (view.name === "diff" && name === "changes")
                ? "gray"
                : "background"}>
              <Icon name={icon} />
              {capitalize(name)}
            </Button>
          </Link>
        {/each}

        {#if view.name === "changes"}
          <div class="global-hide-on-mobile-down" style="margin-left: auto;">
            <RevisionSelector {view} {baseUrl} {patch} {repoId} />
          </div>
        {/if}
        {#if view.name === "diff"}
          <div class="global-hide-on-mobile-down" style="margin-left: auto;">
            <CompareButton
              fromCommit={view.fromCommit}
              toCommit={view.toCommit} />
          </div>
        {/if}
      </div>
      <div class="bottom">
        {#if view.name === "changes"}
          <div
            style:width="100%"
            style:padding="0 1rem"
            style:display="flex"
            class="global-hide-on-small-desktop-up">
            <RevisionSelector {view} {baseUrl} {patch} {repoId} />
          </div>
        {/if}
        {#if view.name === "diff"}
          <div
            style:width="100%"
            style:padding="0 1rem"
            style:display="flex"
            class="global-hide-on-small-desktop-up">
            <CompareButton
              fromCommit={view.fromCommit}
              toCommit={view.toCommit} />
          </div>
          <Changeset
            {baseUrl}
            {repoId}
            revision={view.toCommit}
            files={view.files}
            diff={view.diff} />
        {:else if view.name === "activity"}
          {#each timelineTuple as [revision, timelines], index}
            {@const previousRevision =
              index > 0 ? patch.revisions[index - 1] : undefined}
            <RevisionComponent
              {baseUrl}
              {rawPath}
              {repoId}
              {timelines}
              {...revision}
              first={index === 0}
              {targetBranch}
              patchId={patch.id}
              patchState={patch.state}
              initiallyExpanded={index === patch.revisions.length - 1}
              previousRevId={previousRevision?.id}
              previousRevBase={previousRevision?.base}
              previousRevOid={previousRevision?.oid} />
          {:else}
            <div style:margin="4rem 0">
              <Placeholder
                iconName="no-patches"
                caption="No activity on this patch yet" />
            </div>
          {/each}
        {:else if view.name === "changes"}
          <Changeset
            {baseUrl}
            {repoId}
            revision={view.oid}
            files={view.files}
            diff={view.diff} />
        {:else}
          {utils.unreachable(view)}
        {/if}
      </div>
    </div>

    <div class="metadata global-hide-on-medium-desktop-down">
      <Reviews {baseUrl} {reviews} />
      <Labels labels={patch.labels} />
      <Embeds embeds={uniqueEmbeds} />
    </div>
  </div>
</Layout>
