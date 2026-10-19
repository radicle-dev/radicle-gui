<script lang="ts">
  import type { Owner } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";

  import Button from "@app/components/Button.svelte";

  let ownerKey = $state("person:self");
  let name = $state("");
  let description = $state("");
  let visibility = $state<"public" | "private">("public");

  const valid = $derived(/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name));
  const owner = $derived.by((): Owner => {
    const [type, id] = ownerKey.split(":");
    return type === "org" ? { type: "org", id } : { type: "person", id: "self" };
  });
  const taken = $derived(
    node.repos.some(r => r.name === name && r.owner.type === owner.type && r.owner.id === owner.id),
  );

  function create() {
    const rid = node.do({
      type: "createRepo",
      name,
      description: description.trim(),
      visibility,
      owner,
      readme: `# ${name}\n\n${description.trim() || "A new repository on Radicle."}\n`,
    });
    const repo = rid ? node.world.repos[rid] : undefined;
    if (repo) navigate(node.repoPath(repo));
  }
</script>

<style>
  h1 {
    font: var(--txt-heading-xl);
    margin: 0 0 0.5rem;
  }
  .lede {
    color: var(--color-text-tertiary);
    margin: 0 0 2rem;
    font: var(--txt-body-m-regular);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .path {
    display: grid;
    grid-template-columns: 12rem auto 1fr;
    gap: 0.5rem;
    align-items: end;
  }
  .slash {
    padding-bottom: 0.5rem;
    color: var(--color-text-tertiary);
  }
  .option {
    display: flex;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    cursor: pointer;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .option strong {
    display: block;
    color: var(--color-text-primary);
  }
  .option + .option {
    border-top: 1px solid var(--color-border-subtle);
  }
  .error {
    color: var(--color-feedback-error-text);
  }
</style>

<div class="page-narrow">
  <h1>New repository</h1>
  <p class="lede">
    It's created on your node, signed with your key, and announced to your peers.
  </p>
  <div class="form">
    <div class="path">
      <div class="field">
        <label for="owner">Owner</label>
        <select id="owner" class="select" bind:value={ownerKey}>
          <option value="person:self">@{node.person("self").alias}</option>
          {#each node.myOrgs as org (org.id)}<option value={`org:${org.id}`}>{org.handle}</option>{/each}
        </select>
      </div>
      <span class="slash">/</span>
      <div class="field">
        <label for="name">Name</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="name" class="input" bind:value={name} autofocus placeholder="my-project" />
      </div>
    </div>
    {#if taken}<span class="error txt-body-s-regular">You already have a repository with this name.</span>{/if}
    <div class="field">
      <label for="desc">Description <span class="muted">(optional)</span></label>
      <input id="desc" class="input" bind:value={description} />
    </div>
    <div class="field">
      <span class="label">Visibility</span>
      <div class="card">
        <label class="option">
          <input type="radio" bind:group={visibility} value="public" />
          <div><strong>Public</strong>Anyone on the network can find, seed and clone it.</div>
        </label>
        <label class="option">
          <input type="radio" bind:group={visibility} value="private" />
          <div>
            <strong>Private</strong>
            Only shared with people you allow. Seed nodes won't replicate it.
          </div>
        </label>
      </div>
    </div>
    {#if owner.type === "org"}
      <span class="muted txt-body-s-regular">
        The repository belongs to {node.org(owner.id)?.name}. You start as its only
        maintainer and can add other members afterwards.
      </span>
    {/if}
    <div class="row" style="justify-content: flex-end;">
      <Button variant="naked" onclick={() => history.back()}>Cancel</Button>
      <Button variant="secondary" disabled={!valid || taken} onclick={create}>Create repository</Button>
    </div>
  </div>
</div>
