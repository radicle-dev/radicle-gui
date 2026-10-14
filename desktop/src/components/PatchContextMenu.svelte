<script lang="ts">
  import type { Action } from "@bindings/cob/patch/Action";
  import type { Patch } from "@bindings/cob/patch/Patch";
  import type { Config } from "@bindings/config/Config";
  import type { RepoInfo } from "@bindings/repo/RepoInfo";

  import { nodeRunning } from "@app/lib/events";
  import { invoke, writeToClipboard } from "@app/lib/invoke";
  import { entityUrl } from "@app/lib/mentions";
  import { show } from "@app/lib/modal";
  import * as roles from "@app/lib/roles";
  import { serialEdits } from "@app/lib/serialEdits";
  import { formatOid, publicKeyFromDid } from "@app/lib/utils";

  import { announce } from "@app/components/AnnounceSwitch.svelte";
  import CobMetadataSubmenus from "@app/components/CobMetadataSubmenus.svelte";
  import ContextMenu from "@app/components/ContextMenu.svelte";
  import Icon from "@app/components/Icon.svelte";
  import ConfirmDeleteCob from "@app/modals/ConfirmDeleteCob.svelte";

  interface Props {
    x: number;
    y: number;
    target?: HTMLElement;
    patch: Patch;
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
    patch,
    repo,
    config,
    labelSuggestions,
    onchange,
    onclose,
  }: Props = $props();

  const delegates = $derived(repo.delegates.map(delegate => delegate.did));
  const isDelegate = $derived(!!roles.isDelegate(config.publicKey, delegates));
  const canEdit = $derived(
    !!roles.isDelegateOrAuthor(config.publicKey, delegates, patch.author.did),
  );
  const isOwn = $derived(
    publicKeyFromDid(patch.author.did) === config.publicKey,
  );
  const status = $derived(patch.state.status);
  const url = $derived(
    entityUrl(
      { type: "cob", kind: "patch", rid: repo.rid, oid: patch.id },
      config,
    ),
  );

  const enqueue = serialEdits("Editing patch failed", () => onchange());

  function edit(action: Action) {
    const args = {
      rid: repo.rid,
      cobId: patch.id,
      action,
      opts: { announce: $nodeRunning && $announce },
    };
    enqueue(() => invoke("edit_patch", args));
  }

  function setState(state: "draft" | "open" | "archived") {
    edit({ type: "lifecycle", state: { status: state } });
  }

  function deletePatch() {
    const args = {
      rid: repo.rid,
      cobId: patch.id,
      opts: { announce: $nodeRunning && $announce },
    };
    const refresh = onchange;
    show({
      component: ConfirmDeleteCob,
      props: {
        noun: "patch",
        title: patch.title,
        icon: "patch",
        confirm: async () => {
          await invoke("delete_patch", args);
          await refresh();
        },
      },
    });
  }
</script>

<ContextMenu {x} {y} {target} {onclose}>
  {#if canEdit && status !== "merged"}
    {#if status === "draft"}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => setState("open")}>
        <Icon name="patch" />
        Mark as ready for review
      </button>
    {:else if status === "open"}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => setState("draft")}>
        <Icon name="patch-draft" />
        Convert to draft
      </button>
    {/if}
    {#if status === "archived"}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => setState("open")}>
        <Icon name="patch" />
        Reopen
      </button>
    {:else}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => setState("archived")}>
        <Icon name="patch-archived" />
        Archive
      </button>
    {/if}
    <div class="menu-separator"></div>
  {/if}
  {#if isDelegate}
    <CobMetadataSubmenus
      labels={patch.labels}
      assignees={patch.assignees}
      candidates={repo.delegates}
      {labelSuggestions}
      {edit} />
    <div class="menu-separator"></div>
  {/if}
  <button
    class="menu-item"
    role="menuitem"
    onclick={() =>
      writeToClipboard(`rad patch checkout ${formatOid(patch.id)}`)}>
    <Icon name="checkout" />
    Copy checkout command
  </button>
  <button
    class="menu-item"
    role="menuitem"
    onclick={() => writeToClipboard(patch.id)}>
    <Icon name="copy" />
    Copy patch ID
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
    <button class="menu-item" role="menuitem" onclick={deletePatch}>
      <Icon name="trash" />
      Delete…
    </button>
  {/if}
</ContextMenu>
