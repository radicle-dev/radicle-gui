<script lang="ts">
  import type {
    Author,
    BaseUrl,
    Comment,
    DiffResponse,
    PatchState,
    Revision,
    Verdict,
  } from "@http-client";
  import type { Timeline } from "@app/views/repos/Patch.svelte";

  import * as utils from "@app/lib/utils";
  import { HttpdClient } from "@http-client";
  import { cachedGetDiff } from "@app/views/repos/router";
  import { onMount } from "svelte";

  import CobCommitTeaser from "@app/views/repos/Cob/CobCommitTeaser.svelte";
  import CommentComponent from "@app/components/Comment.svelte";
  import DiffStatBadge from "@app/components/DiffStatBadge.svelte";
  import DropdownList from "@app/components/DropdownList.svelte";
  import DropdownListItem from "@app/components/DropdownList/DropdownListItem.svelte";
  import ErrorMessage from "@app/components/ErrorMessage.svelte";
  import ExpandButton from "@app/components/ExpandButton.svelte";
  import IconButton from "@app/components/IconButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import JobCob from "@app/components/JobCob.svelte";
  import Link from "@app/components/Link.svelte";
  import Loading from "@app/components/Loading.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Popover from "@app/components/Popover.svelte";
  import Reactions from "@app/components/Reactions.svelte";
  import Thread from "@app/components/Thread.svelte";
  import Id from "@app/components/Id.svelte";

  export let baseUrl: BaseUrl;
  export let initiallyExpanded: boolean = false;
  export let rawPath: (commit?: string) => string;
  export let patchId: string;
  export let patchState: PatchState;
  export let repoId: string;
  export let revisionBase: string;
  export let revisionId: string;
  export let revisionEdits: Revision["edits"];
  export let revisionOid: string;
  export let revisionTimestamp: number;
  export let revisionReactions: Comment["reactions"];
  export let revisionAuthor: Author;
  export let revisionDescription: string;
  export let targetBranch: string | undefined = undefined;
  export let timelines: Timeline[];
  export let previousRevBase: string | undefined = undefined;
  export let previousRevId: string | undefined = undefined;
  export let previousRevOid: string | undefined = undefined;
  export let first: boolean;

  let expanded = initiallyExpanded;
  const api = new HttpdClient(baseUrl);
  const lastEdit = revisionEdits.at(-1);

  function formatVerdict(verdict?: Verdict | null) {
    switch (verdict) {
      case "accept":
        return "accepted revision";
      case "reject":
        return "rejected revision";
      default:
        return "reviewed revision";
    }
  }

  function verdictIconColor(verdict?: Verdict | null) {
    switch (verdict) {
      case "accept":
        return "var(--color-text-open)";
      case "reject":
        return "var(--color-feedback-error-text)";
      default:
        return "var(--color-text-tertiary)";
    }
  }

  function badgeColor({ status }: PatchState): string | undefined {
    if (status === "draft") {
      return "var(--color-text-tertiary)";
    } else if (status === "open") {
      return "var(--color-text-open)";
    } else if (status === "archived") {
      return "var(--color-text-archived)";
    } else if (status === "merged") {
      return "var(--color-text-merged)";
    } else {
      return "var(--color-text-open)";
    }
  }

  let response: DiffResponse | undefined = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any | undefined = undefined;
  let loading: boolean = false;

  $: fromCommit =
    previousRevBase !== revisionBase
      ? revisionBase
      : (previousRevBase ?? revisionBase);
  $: baseMismatch = previousRevBase !== revisionBase;

  onMount(async () => {
    try {
      loading = true;
      response = await cachedGetDiff(
        api.baseUrl,
        repoId,
        fromCommit,
        revisionOid,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      error = err;
    } finally {
      loading = false;
    }
  });
</script>

<style>
  .action {
    border-radius: var(--border-radius-md);
    min-height: 2.5rem;
    display: flex;
    align-items: center;
  }
  .merge {
    border: 1px solid var(--color-text-merged);
    background-color: var(--color-surface-merged);
  }
  .positive-review {
    border: 1px solid var(--color-feedback-success-border);
    background-color: var(--color-feedback-success-bg);
  }
  .comment-review {
    border: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface-subtle);
  }
  .negative-review {
    border: 1px solid var(--color-feedback-error-border);
    background-color: var(--color-feedback-error-bg);
  }

  .diff-error {
    margin: 1rem 1.5rem;
  }
  .revision {
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius-sm);
  }
  .revision-box {
    border-radius: var(--border-radius-sm);
  }
  .revision-header {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    padding: 0.5rem;
    font: var(--txt-body-m-regular);
    height: 3rem;
  }
  .revision-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .revision-data {
    gap: 0.5rem;
    display: flex;
    align-items: center;
    margin-left: auto;
    color: var(--color-text-tertiary);
  }
  .revision-description {
    margin-left: 2.75rem;
    padding-right: 0.5rem;
    max-width: fit-content;
  }
  .author-metadata {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .patch-header {
    background-color: var(--color-surface-subtle);
    border-bottom: 1px solid var(--color-border-subtle);
    border-top: 1px solid var(--color-border-subtle);
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 2.5rem;
    padding: 0.5rem 0;
    font: var(--txt-body-m-regular);
    gap: 0.5rem;
  }
  .authorship-header {
    display: inline-flex;
    white-space: nowrap;
    flex-wrap: wrap;
    align-items: center;
    padding: 0 0.5rem;
    min-height: 1.5rem;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
  }
  .target-branch {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .timestamp {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .actions {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding-left: 2.5rem;
    gap: 0.5rem;
  }
  .commits {
    position: relative;
    display: flex;
    flex-direction: column;
    font-size: 0.875rem;
    margin-left: 1.25rem;
    gap: 0.5rem;
    padding: 1rem 0.5rem 1rem 1rem;
    border-left: 1px solid var(--color-border-subtle);
  }
  .commit:last-of-type::after {
    content: "";
    position: absolute;
    left: -18.5px;
    top: 14px;
    bottom: -1rem;
    border-left: 4px solid var(--color-surface-base);
  }
  .expanded {
    box-shadow: 0 0 0 1px var(--color-border-subtle);
  }
  .commit-dot {
    border-radius: var(--border-radius-full);
    width: 4px;
    height: 4px;
    position: absolute;
    top: 0.625rem;
    left: -18.5px;
    background-color: var(--color-border-subtle);
  }
  .connector {
    width: 1px;
    height: 1.5rem;
    margin-left: 1.25rem;
    background-color: var(--color-border-subtle);
  }
  @media (max-width: 719.98px) {
    .revision-box {
      border-radius: 0;
    }
    .action {
      border-radius: 0;
    }
  }
</style>

<div class="revision" style:margin-bottom={expanded ? "2rem" : "0.5rem"}>
  <div class="revision-box" class:expanded>
    <div class="revision-header">
      <div class="revision-name">
        <ExpandButton {expanded} on:toggle={() => (expanded = !expanded)} />
        <span>
          Revision
          <Id id={revisionId} />
        </span>
      </div>
      <div class="revision-data">
        <span
          class="global-hide-on-mobile-down"
          title={utils.absoluteTimestamp(revisionTimestamp)}>
          {utils.formatTimestamp(revisionTimestamp)}
        </span>
        {#if loading}
          <Loading small />
        {/if}
        {#if response?.diff.stats}
          <Link
            title="Compare {utils.formatCommit(
              fromCommit,
            )}..{utils.formatCommit(revisionOid)}"
            route={{
              resource: "repo.patch",
              repo: repoId,
              node: baseUrl,
              patch: patchId,
              view: { name: "diff", fromCommit, toCommit: revisionOid },
            }}>
            {@const { insertions, deletions } = response.diff.stats}
            <DiffStatBadge hoverable {insertions} {deletions} />
          </Link>
        {/if}
        <Popover
          popoverPadding="0"
          popoverPositionTop={expanded ? "3rem" : "2.5rem"}
          popoverPositionRight="0"
          popoverBorderRadius="var(--border-radius-md)">
          <IconButton
            slot="toggle"
            let:toggle
            on:click={toggle}
            title="toggle-context-menu">
            <Icon name="ellipsis-vertical" />
          </IconButton>
          <DropdownList
            slot="popover"
            items={previousRevOid && previousRevId
              ? [revisionBase, previousRevOid]
              : [revisionBase]}>
            <Link
              let:item
              disabled={item !== revisionBase && baseMismatch}
              slot="item"
              title="Compare {utils.formatCommit(item)}..{utils.formatCommit(
                revisionOid,
              )}"
              route={{
                resource: "repo.patch",
                repo: repoId,
                node: baseUrl,
                patch: patchId,
                view: {
                  name: "diff",
                  fromCommit: item,
                  toCommit: revisionOid,
                },
              }}>
              {#if item === revisionBase}
                <DropdownListItem selected={false}>
                  <span class="compare-dropdown-item">
                    Compare to base:
                    <span class="txt-id">
                      {utils.formatObjectId(revisionBase)}
                    </span>
                  </span>
                </DropdownListItem>
              {:else if previousRevId}
                <DropdownListItem
                  selected={false}
                  disabled={baseMismatch}
                  title={baseMismatch
                    ? "Previous revision has different base"
                    : `${utils.formatCommit(item)}..${utils.formatCommit(
                        revisionOid,
                      )}`}>
                  <span class="compare-dropdown-item">
                    Compare to previous revision: <span
                      style:color="var(--color-text-brand)"
                      class="txt-id">
                      {utils.formatObjectId(previousRevId)}
                    </span>
                  </span>
                </DropdownListItem>
              {/if}
            </Link>
          </DropdownList>
        </Popover>
      </div>
    </div>
    {#if expanded}
      <div>
        <div class="patch-header">
          <div class="authorship-header">
            <div
              style:color={badgeColor(patchState)}
              style:padding="0 0.375rem">
              <Icon
                name={patchState.status === "draft"
                  ? "patch-draft"
                  : patchState.status === "merged"
                    ? "patch-merged"
                    : patchState.status === "archived"
                      ? "patch-archived"
                      : "patch"} />
            </div>
            <NodeId
              {baseUrl}
              nodeId={revisionAuthor.id}
              alias={revisionAuthor.alias} />
            {#if patchId === revisionId}
              opened this patch on base
              <Id id={revisionBase} />
            {:else}
              updated to
              <Id id={revisionId} />
              {#if previousRevBase && previousRevBase !== revisionBase}
                on base
                <Id id={revisionBase} />
              {/if}
            {/if}
            <span
              class="timestamp"
              title={utils.absoluteTimestamp(revisionTimestamp)}>
              {utils.formatTimestamp(revisionTimestamp)}
            </span>
            {#if revisionEdits.length > 1 && lastEdit}
              <div
                class="author-metadata"
                title={utils.formatEditedCaption(
                  lastEdit.author,
                  lastEdit.timestamp,
                )}>
                • edited
              </div>
            {/if}
          </div>
          {#if revisionDescription && !first}
            <div class="revision-description txt-body-m-regular">
              <Markdown
                breaks
                rawPath={rawPath(revisionBase)}
                content={revisionDescription} />
            </div>
          {/if}
          {#if revisionReactions && revisionReactions.length > 0}
            <div class="actions">
              <Reactions reactions={revisionReactions} />
            </div>
          {/if}
        </div>
        {#if loading}
          <div style:height="3.5rem">
            <Loading small />
          </div>
        {/if}
        {#if response?.commits}
          <div class="commits">
            {#each response.commits.toReversed() as commit, index}
              <div class="commit" style:position="relative">
                <div class="commit-dot"></div>
                <CobCommitTeaser {commit} {baseUrl} {repoId}>
                  {#if response.commits.length - 1 === index}
                    <div class="global-flex-item" style:margin-right="0.25rem">
                      <JobCob {baseUrl} rid={repoId} commit={commit.id} />
                    </div>
                  {/if}
                </CobCommitTeaser>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if error}
        <div
          class="diff-error txt-code-regular"
          style:border-radius="var(--border-radius-md)">
          <ErrorMessage
            title="Failed to load diff for this revision"
            description="Make sure you are able to connect to the seed:"
            seed={utils.baseUrlToString(api.baseUrl)}
            {error} />
        </div>
      {/if}
    {/if}
  </div>
  {#if expanded}
    {#if timelines.length > 0}
      {#each timelines as element}
        {#if element.type === "thread"}
          <div class="connector"></div>
          <Thread
            {baseUrl}
            thread={element.inner}
            rawPath={rawPath(revisionBase)} />
        {:else if element.type === "merge"}
          <div class="connector"></div>
          <div class="action merge">
            <div class="authorship-header">
              <div style:color="var(--color-text-merged)">
                <Icon name="patch-merged" />
              </div>

              <NodeId
                {baseUrl}
                nodeId={element.inner.author.id}
                alias={element.inner.author.alias}>
              </NodeId>

              merged revision
              <Id id={element.inner.revision} />
              {#if targetBranch}
                into
                <span class="target-branch">
                  <Icon name="branch" />
                  {targetBranch}
                </span>
              {/if}
              at commit
              <Id id={element.inner.commit} />
              <span
                class="timestamp"
                title={utils.absoluteTimestamp(element.inner.timestamp)}>
                {utils.formatTimestamp(element.inner.timestamp)}
              </span>
            </div>
          </div>
        {:else if element.type === "review"}
          {@const [author, review] = element.inner}
          <div class="connector"></div>
          <div
            class="action"
            class:comment-review={review.verdict === null}
            class:positive-review={review.verdict === "accept"}
            class:negative-review={review.verdict === "reject"}>
            <CommentComponent
              {baseUrl}
              id={review.id}
              rawPath={rawPath(revisionBase)}
              authorId={author}
              authorAlias={review.author.alias}
              timestamp={review.timestamp}
              body={review.summary ?? ""}>
              <div slot="caption">
                {formatVerdict(review.verdict)}
                <Id id={revisionId} />
              </div>
              <div slot="icon" style:color={verdictIconColor(review.verdict)}>
                {#if review.verdict === "accept"}
                  <Icon name="comment-checkmark" />
                {:else if review.verdict === "reject"}
                  <Icon name="comment-cross" />
                {:else}
                  <Icon name="comment" />
                {/if}
              </div>
            </CommentComponent>
          </div>
          {#if review.threads.length > 0}
            {#each review.threads as thread}
              <div class="connector"></div>
              <Thread {baseUrl} {thread} rawPath={rawPath(revisionBase)} />
            {/each}
          {/if}
        {/if}
      {/each}
    {/if}
    <slot />
  {/if}
</div>
