<script lang="ts">
  import { following } from "@app/lib/following.svelte";
  import { cachedConfig } from "@app/lib/invoke";
  import { parseNodeId, publicKeyFromDid } from "@app/lib/utils";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import TextInput from "@app/components/TextInput.svelte";

  const loading = following.load();

  let input = $state("");
  let validationMessage: string | undefined = $state(undefined);
  let pending = $state(false);

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    input;

    validationMessage = undefined;
  });

  async function submit() {
    if (input.trim() === "") return;

    const nodeId = parseNodeId(input.trim());
    if (!nodeId) {
      validationMessage = "This is not a valid DID";
      return;
    }
    if (nodeId.pubkey === (await cachedConfig()).publicKey) {
      validationMessage = "You can't follow yourself";
      return;
    }
    if (following.isFollowed(nodeId.pubkey)) {
      validationMessage = "You already follow this user";
      return;
    }

    pending = true;
    try {
      await following.follow(nodeId.pubkey);
      input = "";
    } catch (error) {
      console.error("Following failed", error);
      validationMessage = "Could not follow this user";
    } finally {
      pending = false;
    }
  }

  async function unfollow(publicKey: string) {
    try {
      await following.unfollow(publicKey);
    } catch (error) {
      console.error("Unfollowing failed", error);
    }
  }
</script>

<style>
  .following {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .list {
    display: flex;
    flex-direction: column;
    max-height: 15rem;
    overflow-y: auto;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.375rem 0.375rem 0.375rem 0.75rem;
    min-height: 2.5rem;
  }
  .item + .item {
    border-top: 1px solid var(--color-border-subtle);
  }
  .empty {
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .error {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem 0 0 0.25rem;
    font: var(--txt-body-m-regular);
    color: var(--color-feedback-error-text);
  }
</style>

<div class="following">
  {#await loading}
    <span class="empty">Loading…</span>
  {:then}
    {#if following.nodes.length === 0}
      <span class="empty">You don't follow anyone yet</span>
    {:else}
      <div class="list">
        {#each following.nodes as node (node.did)}
          {@const publicKey = publicKeyFromDid(node.did)}
          <div class="item">
            <NodeId {publicKey} alias={node.alias} />
            <Button variant="ghost" onclick={() => unfollow(publicKey)}>
              Unfollow
            </Button>
          </div>
        {/each}
      </div>
    {/if}
  {:catch}
    <span class="empty">Could not load the users you follow</span>
  {/await}
  <div>
    <div class="global-flex" style:width="100%">
      <TextInput
        valid={validationMessage === undefined}
        bind:value={input}
        onSubmit={submit}
        placeholder="DID, e.g. did:key:z6Mk…" />
      <Button
        variant="secondary"
        onclick={submit}
        disabled={input.trim() === "" || pending}>
        <Icon name="plus" />
        Follow
      </Button>
    </div>
    {#if validationMessage}
      <div class="error">
        <Icon name="warning" />
        {validationMessage}
      </div>
    {/if}
  </div>
</div>
