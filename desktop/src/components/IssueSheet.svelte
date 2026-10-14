<script module lang="ts">
  import type { Action } from "@bindings/cob/issue/Action";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Operation } from "@bindings/cob/Operation";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { cubicIn, cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";

  import { invoke } from "@app/lib/invoke";
  import * as router from "@app/lib/router";
  import { issueStatusIcon, issueStatusLabel } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueDetail from "@app/components/IssueDetail.svelte";
  import ScrollArea from "@app/components/ScrollArea.svelte";
  import ShareButton from "@app/components/ShareButton.svelte";

  export type IssueSheetData = Awaited<ReturnType<typeof loadIssueSheet>>;

  export async function loadIssueSheet(
    repo: RepoInfo,
    rid: string,
    id: string,
  ) {
    const [sheetRepo, issue, activity, threads] = await Promise.all([
      rid === repo.rid
        ? Promise.resolve(repo)
        : invoke<RepoInfo>("repo_by_id", { rid }),
      invoke<Issue>("issue_by_id", { rid, id }),
      invoke<Operation<Action>[]>("activity_by_issue", { rid, id }),
      invoke<Thread[]>("comment_threads_by_issue_id", { rid, id }),
    ]);
    return { repo: sheetRepo, issue, activity, threads };
  }
</script>

<script lang="ts">
  interface Props {
    data: IssueSheetData;
    config: Config;
    onClose: () => void;
    onChange: () => void;
  }

  const { data, config, onClose, onChange }: Props = $props();

  const rid = $derived(data.repo.rid);
  const issueId = $derived(data.issue.id);

  // Follows edits made in the sheet, so the breadcrumb shows the new state.
  let issue = $derived(data.issue);

  function openList() {
    void router.push({
      resource: "repo.issues",
      rid,
      status: issue.state.status,
    });
  }

  function openPage() {
    void router.push({
      resource: "repo.issue",
      rid,
      issue: issueId,
      status: "all",
    });
  }
</script>

<style>
  .sheet {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    width: min(48rem, 60vw);
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-canvas);
    border-left: 1px solid var(--color-border-subtle);
    box-shadow: var(--elevation-low);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 2.75rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    margin-right: auto;
  }
  .breadcrumb-link {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    white-space: nowrap;
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
  .body {
    padding: 0 2rem 2rem;
    min-width: 0;
  }
</style>

<div
  class="sheet"
  role="dialog"
  aria-label="Issue"
  in:fly={{ x: "100%", opacity: 1, duration: 260, easing: cubicOut }}
  out:fly={{ x: "100%", opacity: 1, duration: 200, easing: cubicIn }}>
  <div class="header">
    <div class="breadcrumb">
      <Icon name={issueStatusIcon[issue.state.status]} />
      <button class="breadcrumb-link" onclick={openList}>
        {issueStatusLabel[issue.state.status]}
      </button>
      <Icon name="chevron-right" />
      <span class="breadcrumb-title">{issue.title}</span>
    </div>
    <ShareButton
      target={{ type: "cob", kind: "issue", rid, oid: issueId }}
      id={issueId}
      idLabel="issue"
      variant="naked"
      {config} />
    <Button
      styleHeight="2rem"
      variant="naked"
      title="Open full page"
      onclick={openPage}>
      <Icon name="expand-out" />
    </Button>
    <Button styleHeight="2rem" variant="naked" title="Close" onclick={onClose}>
      <Icon name="close" />
    </Button>
  </div>
  <ScrollArea style="flex: 1; min-height: 0;">
    {#key issueId}
      <div class="body">
        <IssueDetail
          repo={data.repo}
          bind:issue
          activity={data.activity}
          threads={data.threads}
          {config}
          {onChange} />
      </div>
    {/key}
  </ScrollArea>
</div>
