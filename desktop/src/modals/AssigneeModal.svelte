<script lang="ts">
  import type { Author } from "@bindings/cob/Author";

  import { invoke } from "@app/lib/invoke";
  import { listKnownUsers } from "@app/lib/knownUsers";
  import { hide } from "@app/lib/modal";
  import {
    authorForNodeId,
    parseNodeId,
    publicKeyFromDid,
  } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  interface Props {
    assignees: Author[];
    save: (assignees: Author[]) => void;
  }

  const { assignees, save }: Props = $props();

  // The modal edits a local copy seeded from the current assignees.
  // svelte-ignore state_referenced_locally
  let working: Author[] = $state([...assignees]);
  let known: Author[] = $state([]);
  let loading = $state(true);
  let filter = $state("");

  $effect(() => {
    listKnownUsers()
      .then(users => {
        known = users;
      })
      .catch(error => console.error("Loading known users failed", error))
      .finally(() => (loading = false));
  });

  const isSelected = (did: string) => working.some(a => a.did === did);

  // The known users plus any current assignees that aren't otherwise known, so
  // existing assignments always show even if the user isn't on a seeded repo.
  const candidates = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, Author>();
    for (const user of known) map.set(user.did, user);
    for (const assignee of working) {
      if (!map.has(assignee.did)) map.set(assignee.did, assignee);
    }
    const query = filter.trim().toLowerCase();
    let list = [...map.values()];
    if (query) {
      list = list.filter(
        u =>
          (u.alias ?? "").toLowerCase().includes(query) ||
          u.did.toLowerCase().includes(query),
      );
    }
    return list;
  });

  // Allow assigning a raw DID that isn't in the known list.
  const typedDid = $derived.by(() => {
    const parsed = parseNodeId(filter.trim());
    return parsed ? `${parsed.prefix}${parsed.pubkey}` : undefined;
  });
  const canAddTyped = $derived(
    typedDid !== undefined &&
      !candidates.some(u => u.did === typedDid) &&
      !working.some(a => a.did === typedDid),
  );

  function toggle(user: Author) {
    if (isSelected(user.did)) {
      working = working.filter(a => a.did !== user.did);
    } else {
      working = [...working, user];
    }
  }

  async function addTyped() {
    if (!typedDid) return;
    const alias = await invoke<string | null>("alias", {
      nid: publicKeyFromDid(typedDid),
    });
    working = [...working, { did: typedDid, alias: alias ?? undefined }];
    filter = "";
  }
</script>

<style>
  .modal {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 26rem;
    max-width: 90vw;
    padding: 1.5rem;
    background-color: var(--color-surface-canvas);
    border-radius: var(--border-radius-md);
    box-shadow: var(--elevation-medium);
  }
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
  .icon-badge {
    display: flex;
    color: var(--color-text-brand);
  }
  .title {
    color: var(--color-text-primary);
    text-align: center;
  }
  .list {
    display: flex;
    flex-direction: column;
    height: 18rem;
    overflow-y: auto;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    background: none;
    border: 0;
    border-radius: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
  }
  .row:not(:last-child) {
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .row:hover,
  .row:focus-visible {
    background-color: var(--color-surface-subtle);
  }
  .check {
    display: inline-flex;
    width: 1rem;
    color: var(--color-text-secondary);
  }
  .check.selected {
    color: var(--color-text-brand);
  }
  .check.trailing {
    margin-left: auto;
  }
  .empty,
  .loading {
    padding: 1rem;
    color: var(--color-text-tertiary);
    text-align: center;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>

<div class="modal">
  <div class="header">
    <div class="icon-badge"><Icon name="avatar-incognito" size="32" /></div>
    <div class="title txt-heading-m">Assignees</div>
  </div>
  <TextInput
    autofocus
    placeholder="Filter users or paste a DID (did:key:…)"
    bind:value={filter}
    onDismiss={() => hide()} />
  <div class="list">
    {#if loading}
      <span class="loading txt-body-m-regular">Loading users…</span>
    {:else}
      {#if canAddTyped}
        <button type="button" class="row" onclick={addTyped}>
          <span class="check"><Icon name="plus" /></span>
          <span class="txt-body-m-regular">Assign {filter.trim()}</span>
        </button>
      {/if}
      {#each candidates as user (user.did)}
        <button type="button" class="row" onclick={() => toggle(user)}>
          <NodeId {...authorForNodeId(user)} />
          <span class="check trailing" class:selected={isSelected(user.did)}>
            {#if isSelected(user.did)}<Icon name="checkmark" />{/if}
          </span>
        </button>
      {/each}
      {#if candidates.length === 0 && !canAddTyped}
        <span class="empty txt-body-m-regular">No matching users.</span>
      {/if}
    {/if}
  </div>
  <div class="actions">
    <Button variant="naked" onclick={() => hide()}>Cancel</Button>
    <Button
      variant="secondary"
      onclick={() => {
        save([...working]);
        hide();
      }}>
      Save
    </Button>
  </div>
</div>
