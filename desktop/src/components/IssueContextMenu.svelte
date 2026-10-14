<script lang="ts">
  import type { Action } from "@bindings/cob/issue/Action";
  import type { Issue } from "@bindings/cob/issue/Issue";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { nodeRunning } from "@app/lib/events";
  import { invoke, writeToClipboard } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import { show } from "@app/lib/modal";
  import * as roles from "@app/lib/roles";
  import { serialEdits } from "@app/lib/serialEdits";
  import { publicKeyFromDid } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import CobMetadataSubmenus from "@app/components/CobMetadataSubmenus.svelte";
  import ContextMenu from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ConfirmDeleteCob from "@app/modals/ConfirmDeleteCob.svelte";

  interface Props {
    x: number;
    y: number;
    target?: HTMLElement;
    issue: Issue;
    repo: RepoInfo;
    config: Config;
    labelSuggestions: string[];
    onchange: () => Promise<void>;
    onclose: () => void;
  }

  const {
    x,
    y,
    target,
    issue,
    repo,
    config,
    labelSuggestions,
    onchange,
    onclose,
  }: Props = $props();

  const delegates = $derived(repo.delegates.map(delegate => delegate.did));
  const isDelegate = $derived(!!roles.isDelegate(config.publicKey, delegates));
  const canEdit = $derived(
    !!roles.isDelegateOrAuthor(config.publicKey, delegates, issue.author.did),
  );
  const isOwn = $derived(
    publicKeyFromDid(issue.author.did) === config.publicKey,
  );
  const url = $derived(
    entityUrl(
      { type: "cob", kind: "issue", rid: repo.rid, oid: issue.id },
      config,
    ),
  );

  const enqueue = serialEdits("Editing issue failed", () => onchange());

  function edit(action: Action) {
    const args = {
      rid: repo.rid,
      cobId: issue.id,
      action,
      opts: { announce: $nodeRunning && $announce },
    };
    enqueue(() => invoke("edit_issue", args));
  }

  function deleteIssue() {
    const args = {
      rid: repo.rid,
      cobId: issue.id,
      opts: { announce: $nodeRunning && $announce },
    };
    const refresh = onchange;
    show({
      component: ConfirmDeleteCob,
      props: {
        noun: "issue",
        title: issue.title,
        icon: "issue",
        confirm: async () => {
          await invoke("delete_issue", args);
          await refresh();
        },
      },
    });
  }
</script>

<ContextMenu {x} {y} {target} {onclose}>
  {#if canEdit}
    {#if issue.state.status === "open"}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() =>
          edit({
            type: "lifecycle",
            state: { status: "closed", reason: "solved" },
          })}>
        <Icon name="issue-closed" />
        Close as solved
      </button>
      <button
        class="menu-item"
        role="menuitem"
        onclick={() =>
          edit({
            type: "lifecycle",
            state: { status: "closed", reason: "other" },
          })}>
        <Icon name="issue-closed" />
        Close as other
      </button>
    {:else}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => edit({ type: "lifecycle", state: { status: "open" } })}>
        <Icon name="issue" />
        Reopen
      </button>
    {/if}
    <div class="menu-separator"></div>
  {/if}
  {#if isDelegate}
    <CobMetadataSubmenus
      labels={issue.labels}
      assignees={issue.assignees}
      candidates={repo.delegates}
      {labelSuggestions}
      {edit} />
    <div class="menu-separator"></div>
  {/if}
  <button
    class="menu-item"
    role="menuitem"
    onclick={() => writeToClipboard(issue.id)}>
    <Icon name="copy" />
    Copy issue ID
  </button>
  {#if url}
    <button
      class="menu-item"
      role="menuitem"
      onclick={() => writeToClipboard(url)}>
      <Icon name="link" />
      Copy link
    </button>
  {/if}
  {#if isOwn}
    <div class="menu-separator"></div>
    <button class="menu-item" role="menuitem" onclick={deleteIssue}>
      <Icon name="trash" />
      Delete…
    </button>
  {/if}
</ContextMenu>
