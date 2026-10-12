<script lang="ts">
  import type { Author } from "@bindings/cob/Author";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Embed } from "@bindings/cob/thread/Embed";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { nodeRunning } from "@app/lib/events";
  import { invoke } from "@app/lib/invoke";
  import { disableHide, enableHide, forceHide, hide } from "@app/lib/modal";
  import * as roles from "@app/lib/roles";
  import * as router from "@app/lib/router";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import AssigneeInput from "@app/components/AssigneeInput.svelte";
  import Button from "@app/components/Button.svelte";
  import ExtendedTextarea from "@app/components/ExtendedTextarea.svelte";
  import Icon from "@app/components/Icon.svelte";
  import LabelInput from "@app/components/LabelInput.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    repo: RepoInfo;
  }

  const { repo }: Props = $props();

  let commentBox: ExtendedTextarea | undefined = $state();
  let preview = $state(false);
  let title = $state("");
  let body = $state("");
  let assignees: Author[] = $state([]);
  let labels: string[] = $state([]);

  $effect(() => {
    const isDirty =
      title.trim() !== "" ||
      body.trim() !== "" ||
      labels.length > 0 ||
      assignees.length > 0;
    if (isDirty) {
      disableHide();
    } else {
      enableHide();
    }
  });

  const configPromise = invoke<Config>("config");

  async function createIssue(description: string, embeds: Embed[]) {
    return invoke<Issue>("create_issue", {
      rid: repo.rid,
      new: {
        title,
        description,
        labels: $state.snapshot(labels),
        assignees: $state.snapshot(assignees.map(a => a.did)),
        embeds,
      },
      opts: { announce: $nodeRunning && $announce },
    });
  }
</script>

<style>
  .modal {
    width: 56rem;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-lg);
    background-color: var(--color-surface-canvas);
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 3.25rem;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    min-width: 0;
  }
  .repo-name {
    font: var(--txt-body-m-semibold);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title {
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
    white-space: nowrap;
  }
  .body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .title-preview {
    font: var(--txt-heading-s);
    color: var(--color-text-primary);
    padding: 0.5rem 0;
  }
  .metadata {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
    font: var(--txt-body-m-regular);
  }
</style>

<div class="modal">
  <div class="header">
    <div class="header-left">
      <RepoAvatar
        name={repo.payloads["xyz.radicle.project"]?.data.name ?? ""}
        rid={repo.rid}
        styleWidth="1rem" />
      <span class="repo-name">
        {repo.payloads["xyz.radicle.project"]?.data.name}
      </span>
      <Icon name="chevron-right" />
      <span class="title">New issue</span>
    </div>
    <Button variant="naked" onclick={forceHide}>
      <span style:color="var(--color-text-tertiary)">
        <Icon name="close" />
      </span>
    </Button>
  </div>
  <div class="body">
    {#if preview}
      <div class="title-preview">
        {#if title.trim().length === 0}
          <span class="txt-missing">No title.</span>
        {:else}
          {title}
        {/if}
      </div>
    {:else}
      <TextInput
        placeholder="Title"
        autofocus
        onDismiss={hide}
        onModifierSubmit={() => commentBox?.triggerSubmit()}
        bind:value={title} />
    {/if}

    <ExtendedTextarea
      bind:this={commentBox}
      textAreaSize="fixed-height"
      disableSubmit={title.trim() === ""}
      styleMinHeight="20rem"
      submitVariant="secondary"
      submitCaption="Save"
      hideDiscard
      close={hide}
      submit={async ({ comment, embeds }) => {
        try {
          const response = await createIssue(
            comment,
            Array.from(embeds.values()),
          );
          await router.push({
            resource: "repo.issue",
            rid: repo.rid,
            issue: response.id,
            status: "open",
          });
          forceHide();
        } catch {
          console.error("Not able to create issue.");
        }
      }}
      rid={repo.rid}
      bind:preview
      bind:body
      borderVariant="ghost"
      placeholder="Description">
      {#snippet leadingActions()}
        {#await configPromise then config}
          {#if !!roles.isDelegate( config.publicKey, repo.delegates.map(d => d.did) )}
            <div class="metadata">
              <LabelInput
                allowedToEdit={true}
                {preview}
                {labels}
                submitInProgress={false}
                save={newLabels => {
                  labels = newLabels;
                }} />
              <AssigneeInput
                delegates={repo.delegates}
                allowedToEdit={true}
                {preview}
                bind:assignees
                submitInProgress={false}
                save={newAssignees => {
                  assignees = newAssignees;
                }} />
            </div>
          {/if}
        {/await}
      {/snippet}
    </ExtendedTextarea>
  </div>
</div>
