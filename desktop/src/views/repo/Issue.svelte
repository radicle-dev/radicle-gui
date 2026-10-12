<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Action } from "@bindings/cob/issue/Action";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Operation } from "@bindings/cob/Operation";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { issueTimeline } from "@app/lib/issueTimeline";
  import { show } from "@app/lib/modal";
  import * as roles from "@app/lib/roles";
  import * as router from "@app/lib/router";
  import {
    issueStatusIcon,
    issueStatusLabel,
    publicKeyFromDid,
  } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import Button from "@app/components/Button.svelte";
  import ConfirmDeleteButton from "@app/components/ConfirmDeleteButton.svelte";
  import Discussion from "@app/components/Discussion.svelte";
  import EditableTitle from "@app/components/EditableTitle.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueActivityItem, {
    type FlattenedIssueOperation,
  } from "@app/components/IssueActivityItem.svelte";
  import IssueDescription from "@app/components/IssueDescription.svelte";
  import IssueMetadata from "@app/components/IssueMetadata.svelte";
  import IssueStateButton from "@app/components/IssueStateButton.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";
  import Topbar from "@app/components/Topbar.svelte";
  import CreateIssueModal from "@app/modals/CreateIssue.svelte";

  import Layout from "./Layout.svelte";

  interface Props {
    repo: RepoInfo;
    issue: Issue;
    activity: Operation<Action>[];
    config: Config;
    threads: Thread[];
  }

  /* eslint-disable prefer-const */
  let { repo, issue, activity, config, threads }: Props = $props();
  /* eslint-enable prefer-const */

  const canEditIssue = $derived(
    roles.isDelegateOrAuthor(
      config.publicKey,
      repo.delegates.map(delegate => delegate.did),
      issue.author.did,
    ),
  );

  const isOwnIssue = $derived(
    publicKeyFromDid(issue.author.did) === config.publicKey,
  );

  const activityItems = $derived(issueTimeline(issue, activity));

  async function reload() {
    [issue, activity, threads] = await Promise.all([
      invoke<Issue>("issue_by_id", {
        rid: repo.rid,
        id: issue.id,
      }),
      invoke<Operation<Action>[]>("activity_by_issue", {
        rid: repo.rid,
        id: issue.id,
      }),
      invoke<Thread[]>("comment_threads_by_issue_id", {
        rid: repo.rid,
        id: issue.id,
      }),
    ]);
  }

  async function createComment(
    body: string,
    embeds: Embed[],
    replyTo?: string,
  ) {
    try {
      await invoke("create_issue_comment", {
        rid: repo.rid,
        new: { id: issue.id, body, embeds, replyTo },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Comment creation failed: ", error);
    } finally {
      await reload();
    }
  }

  async function editComment(id: string, body: string, embeds: Embed[]) {
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: {
          type: "comment.edit",
          id,
          body,
          embeds,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Issue comment editing failed: ", error);
    } finally {
      await reload();
    }
  }

  /// The protocol authorizes a redaction for a delegate or the comment's own
  /// author, and refuses it outright for an issue's root comment — which is the
  /// issue body, and never appears in these threads.
  async function deleteComment(id: string) {
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: {
          type: "comment.redact",
          id,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Issue comment deletion failed: ", error);
    } finally {
      await reload();
    }
  }

  async function updateTitle(newTitle: string) {
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: {
          type: "edit",
          id: issue.id,
          title: newTitle,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Issue title editing failed: ", error);
    } finally {
      await reload();
    }
  }

  async function reactOnComment(
    commentId: string,
    authors: Author[],
    reaction: string,
  ) {
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: {
          type: "comment.react",
          id: commentId,
          reaction,
          active: !authors.find(
            ({ did }) => publicKeyFromDid(did) === config.publicKey,
          ),
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Editing reactions failed", error);
    } finally {
      await reload();
    }
  }

  async function deleteIssue() {
    try {
      await invoke("delete_issue", {
        rid: repo.rid,
        cobId: issue.id,
        opts: { announce: $nodeRunning && $announce },
      });
      void router.push({
        resource: "repo.issues",
        rid: repo.rid,
        status: issue.state.status,
      });
    } catch (error) {
      console.error("Deleting issue failed", error);
    }
  }

  async function saveState(state: Issue["state"]) {
    try {
      await invoke("edit_issue", {
        rid: repo.rid,
        cobId: issue.id,
        action: {
          type: "lifecycle",
          state,
        },
        opts: { announce: $nodeRunning && $announce },
      });
    } catch (error) {
      console.error("Changing issue state failed", error);
    } finally {
      await reload();
    }
  }
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }
  .breadcrumb-link {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .breadcrumb-link:hover {
    color: var(--color-text-primary);
  }
  .breadcrumb-title {
    color: var(--color-text-primary);
    font: var(--txt-body-m-medium);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .main {
    padding: 1.5rem 6rem;
    min-width: 0;
    max-width: 80rem;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "title"
      "meta"
      "content";
  }
  .title {
    grid-area: title;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
  }
  .meta-bar {
    grid-area: meta;
    margin-bottom: 0.5rem;
  }
  .content {
    grid-area: content;
    min-width: 0;
  }
</style>

<Layout>
  <div class="page">
    <Topbar>
      <div class="breadcrumb">
        <Icon name={issueStatusIcon[issue.state.status]} />
        <button
          class="breadcrumb-link"
          onclick={() =>
            router.push({
              resource: "repo.issues",
              rid: repo.rid,
              status: issue.state.status,
            })}>
          {issueStatusLabel[issue.state.status]}
        </button>
        <Icon name="chevron-right" />
        <span class="breadcrumb-title">{issue.title}</span>
      </div>
      <div
        style:margin-left="auto"
        style:display="flex"
        style:gap="0.5rem"
        style:z-index="40">
        {#if isOwnIssue}
          <ConfirmDeleteButton noun="issue" onDelete={deleteIssue} />
        {/if}
        <ShareButton
          target={{ type: "cob", kind: "issue", rid: repo.rid, oid: issue.id }}
          id={issue.id}
          idLabel="issue"
          variant="naked"
          {config} />
        <Button
          styleHeight="2rem"
          variant="naked"
          onclick={() =>
            show({
              component: CreateIssueModal,
              props: { repo },
            })}>
          <Icon name="plus" />New issue
        </Button>
      </div>
    </Topbar>

    <ScrollArea style="flex: 1; min-height: 0;">
      <div class="main">
        <div class="title">
          <IssueStateButton
            selectedState={issue.state}
            onSelect={saveState}
            disabled={!canEditIssue} />
          <EditableTitle
            {updateTitle}
            allowedToEdit={canEditIssue}
            title={issue.title}
            cobId={issue.id} />
        </div>

        <div class="meta-bar">
          <IssueMetadata {config} {issue} {repo} {reload} />
        </div>

        <div class="content">
          {#if issue.body}
            {@const body = issue.body}
            <IssueDescription
              rid={repo.rid}
              body={body.edits.slice(-1)[0].body}
              embeds={body.embeds ?? []}
              reactions={body.reactions}
              currentUserNid={config.publicKey}
              allowedToEdit={!!canEditIssue}
              editComment={(text, embeds) => editComment(body.id, text, embeds)}
              reactOnComment={(authors, reaction) =>
                reactOnComment(body.id, authors, reaction)} />
          {/if}

          {#snippet renderActivity(
            op: FlattenedIssueOperation,
            { hideAuthor }: { hideAuthor: boolean },
          )}
            <IssueActivityItem {op} {hideAuthor} />
          {/snippet}

          <Discussion
            repoDelegates={repo.delegates}
            cobId={issue.id}
            commentThreads={threads}
            {config}
            {createComment}
            {editComment}
            {deleteComment}
            {reactOnComment}
            rid={repo.rid}
            {activityItems}
            {renderActivity}
            authorOf={op => op.author} />
        </div>
      </div>
    </ScrollArea>
  </div>
</Layout>
