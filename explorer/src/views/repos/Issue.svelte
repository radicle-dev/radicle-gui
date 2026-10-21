<script lang="ts">
  import type { BaseUrl, Issue, Repo } from "@http-client";

  import capitalize from "lodash/capitalize";
  import uniqBy from "lodash/uniqBy";

  import * as utils from "@app/lib/utils";

  import Assignees from "@app/views/repos/Cob/Assignees.svelte";
  import Badge from "@app/components/Badge.svelte";
  import CobHeader from "@app/views/repos/Cob/CobHeader.svelte";
  import Embeds from "@app/views/repos/Cob/Embeds.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Id from "@app/components/Id.svelte";
  import InlineTitle from "@app/views/repos/components/InlineTitle.svelte";
  import Labels from "@app/views/repos/Cob/Labels.svelte";
  import Layout from "./Layout.svelte";
  import Link from "@app/components/Link.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import Reactions from "@app/components/Reactions.svelte";
  import Separator from "./Separator.svelte";
  import Share from "@app/views/repos/Share.svelte";
  import ThreadComponent from "@app/components/Thread.svelte";

  export let baseUrl: BaseUrl;
  export let issue: Issue;
  export let repo: Repo;
  export let repoId: string;
  export let rawPath: (commit?: string) => string;
  export let nodeId: string;
  export let nodeAvatarUrl: string | undefined;

  $: uniqueEmbeds = uniqBy(
    issue.discussion.flatMap(comment => comment.embeds),
    "content",
  );
  $: threads = issue.discussion
    .filter(
      comment =>
        (comment.id !== issue.discussion[0].id && !comment.replyTo) ||
        comment.replyTo === issue.discussion[0].id,
    )
    .map(thread => {
      return {
        root: thread,
        replies: issue.discussion
          .filter(comment => comment.replyTo === thread.id)
          .sort((a, b) => a.timestamp - b.timestamp),
      };
    }, []);
  $: lastDescriptionEdit =
    issue.discussion[0].edits.length > 1
      ? issue.discussion[0].edits.at(-1)
      : undefined;

  const issueStatusLabel: Record<Issue["state"]["status"], string> = {
    open: "Open Issues",
    closed: "Closed Issues",
  };
</script>

<style>
  .issue {
    display: flex;
    flex: 1;
    min-height: 100%;
  }
  .main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    background-color: var(--color-surface-subtle);
  }
  .bottom {
    padding: 0 1rem 2.5rem 1rem;
    background-color: var(--color-surface-base);
    height: 100%;
    border-top: 1px solid var(--color-border-subtle);
  }
  .connector {
    width: 1px;
    height: 1.5rem;
    margin-left: 1.25rem;
    background-color: var(--color-border-subtle);
  }
  .metadata {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    border-left: 1px solid var(--color-border-subtle);
    gap: 1.5rem;
    width: 20rem;
  }
  .threads {
    display: flex;
    flex-direction: column;
  }

  .author-metadata {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
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
  .reactions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-left: -0.25rem;
  }
  @media (max-width: 719.98px) {
    .bottom {
      padding: 0;
    }
  }
</style>

<Layout
  {baseUrl}
  {nodeId}
  {nodeAvatarUrl}
  {repo}
  {repoId}
  activeTab="issues"
  stylePaddingBottom="0">
  <svelte:fragment slot="breadcrumb">
    <Separator />
    <Link
      route={{
        resource: "repo.issues",
        repo: repoId,
        node: baseUrl,
        status: issue.state.status,
      }}>
      {issueStatusLabel[issue.state.status]}
    </Link>
    <Separator />
    <span class="txt-id">
      <div class="global-hide-on-small-desktop-down">
        {issue.id}
      </div>
      <div class="global-hide-on-medium-desktop-up">
        {utils.formatObjectId(issue.id)}
      </div>
    </span>
  </svelte:fragment>

  <div class="issue">
    <div class="main">
      <CobHeader>
        <svelte:fragment slot="title">
          <div style="display: flex; gap: 1rem; width: 100%;">
            {#if issue.title}
              <div class="title">
                <InlineTitle fontSize="heading-l" content={issue.title} />
              </div>
            {:else}
              <span style:color="var(--color-text-tertiary)">No title</span>
            {/if}
          </div>
          <Share />
        </svelte:fragment>
        <svelte:fragment slot="state">
          {#if issue.state.status === "open"}
            <Badge size="tiny" variant="open">
              <Icon name="issue" />
              {capitalize(issue.state.status)}
            </Badge>
          {:else}
            <Badge size="tiny" variant="merged">
              <Icon name="issue-closed" />
              {capitalize(issue.state.status)} as
              {issue.state.reason}
            </Badge>
          {/if}
          <NodeId
            {baseUrl}
            nodeId={issue.author.id}
            alias={issue.author.alias} />
          opened
          <Id id={issue.id} />
          <span title={utils.absoluteTimestamp(issue.discussion[0].timestamp)}>
            {utils.formatTimestamp(issue.discussion[0].timestamp)}
          </span>
          {#if lastDescriptionEdit}
            <div
              class="author-metadata"
              title={utils.formatEditedCaption(
                lastDescriptionEdit.author,
                lastDescriptionEdit.timestamp,
              )}>
              • edited
            </div>
          {/if}
        </svelte:fragment>
        <div slot="subtitle" class="global-hide-on-desktop-up">
          <div
            style:margin-top="2rem"
            style="display: flex; flex-direction: column; gap: 0.5rem;">
            <Assignees assignees={issue.assignees} {baseUrl} />
            <Labels labels={issue.labels} />
            <Embeds embeds={uniqueEmbeds} />
          </div>
        </div>
        <svelte:fragment slot="description">
          {#if issue.discussion[0].body}
            <Markdown
              breaks
              content={issue.discussion[0].body}
              rawPath={rawPath(
                repo.payloads["xyz.radicle.project"].meta.head,
              )} />
          {:else}
            <span style:color="var(--color-text-tertiary)">No description</span>
          {/if}
          <div class="reactions">
            {#if issue.discussion[0].reactions.length > 0}
              <Reactions reactions={issue.discussion[0].reactions} />
            {/if}
          </div>
        </svelte:fragment>
      </CobHeader>
      <div class="bottom">
        {#if threads.length > 0}
          <div class="connector"></div>
          <div class="threads">
            {#each threads as thread, i (thread.root.id)}
              <ThreadComponent
                {baseUrl}
                {thread}
                rawPath={rawPath(
                  repo.payloads["xyz.radicle.project"].meta.head,
                )} />
              {#if i < threads.length - 1}
                <div class="connector"></div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    </div>
    <div class="metadata global-hide-on-medium-desktop-down">
      <Assignees assignees={issue.assignees} {baseUrl} />
      <Labels labels={issue.labels} />
      <Embeds embeds={uniqueEmbeds} />
    </div>
  </div>
</Layout>
