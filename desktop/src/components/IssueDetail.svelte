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
  import * as roles from "@app/lib/roles";
  import { publicKeyFromDid } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import Discussion from "@app/components/Discussion.svelte";
  import EditableTitle from "@app/components/EditableTitle.svelte";
  import IssueActivityItem, {
    type FlattenedIssueOperation,
  } from "@app/components/IssueActivityItem.svelte";
  import IssueDescription from "@app/components/IssueDescription.svelte";
  import IssueMetadata from "@app/components/IssueMetadata.svelte";
  import IssueStateButton from "@app/components/IssueStateButton.svelte";

  interface Props {
    repo: RepoInfo;
    issue: Issue;
    activity: Operation<Action>[];
    config: Config;
    threads: Thread[];
    onChange?: () => void;
  }

  /* eslint-disable prefer-const */
  let {
    repo,
    issue = $bindable(),
    activity,
    config,
    threads,
    onChange,
  }: Props = $props();
  /* eslint-enable prefer-const */

  const canEditIssue = $derived(
    roles.isDelegateOrAuthor(
      config.publicKey,
      repo.delegates.map(delegate => delegate.did),
      issue.author.did,
    ),
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
    onChange?.();
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
  .title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
  }
  .meta-bar {
    margin-bottom: 0.5rem;
  }
  .content {
    min-width: 0;
  }
</style>

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
