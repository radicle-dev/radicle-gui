<script lang="ts">
  import type { Action } from "@bindings/cob/issue/Action";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Operation } from "@bindings/cob/Operation";
  import type { Thread } from "@bindings/cob/thread/Thread";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { show } from "@app/lib/modal";
  import * as router from "@app/lib/router";
  import {
    issueStatusIcon,
    issueStatusLabel,
    publicKeyFromDid,
  } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import Button from "@app/components/Button.svelte";
  import ConfirmDeleteButton from "@app/components/ConfirmDeleteButton.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IssueDetail from "@app/components/IssueDetail.svelte";
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

  const isOwnIssue = $derived(
    publicKeyFromDid(issue.author.did) === config.publicKey,
  );

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
        <IssueDetail {repo} bind:issue {activity} {config} {threads} />
      </div>
    </ScrollArea>
  </div>
</Layout>
