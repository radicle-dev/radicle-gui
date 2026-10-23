<script lang="ts">
  import { untrack } from "svelte";

  import type { Owner } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";
  import { toast } from "@app/lib/toast.svelte";

  import Button from "@app/components/Button.svelte";
  import Dropdown from "@app/components/Dropdown.svelte";

  interface Props {
    // Owner to start with, as "org:<id>", e.g. from an org's repositories.
    owner?: string;
  }

  const { owner: initialOwner }: Props = $props();
  let ownerKey = $state(
    untrack(() => (initialOwner && node.org(initialOwner.replace(/^org:/, "")) ? initialOwner : "person:self")),
  );
  let name = $state("");
  let description = $state("");
  let visibility = $state<"public" | "private">("public");

  const valid = $derived(/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name));
  // What the name would be with spaces and other characters cleaned up.
  const suggestion = $derived(
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "")
      .slice(0, 64),
  );
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
    if (!repo) return;
    toast(`Created ${node.ownerHandle(repo.owner)}/${repo.name}, now seeding`, { icon: "seed-filled" });
    navigate(node.repoPath(repo));
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
  .suggest {
    all: unset;
    cursor: pointer;
    margin-left: 0.25rem;
    font: var(--txt-body-s-medium);
    color: var(--color-text-brand);
    text-decoration: underline;
    text-underline-offset: 2px;
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
        <Dropdown
          id="owner"
          options={[
            { value: "person:self", label: `@${node.person("self").alias}`, person: "self" },
            ...node.myOrgs.map(org => ({ value: `org:${org.id}`, label: org.handle, org: org.id })),
          ]}
          value={ownerKey}
          onchange={v => (ownerKey = v)} />
      </div>
      <span class="slash">/</span>
      <div class="field">
        <label for="name">Name</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="name" class="input" bind:value={name} autofocus placeholder="my-project" />
      </div>
    </div>
    {#if name && !valid}
      <span class="error txt-body-s-regular">
        Names can't contain spaces. Use letters, numbers, dots, dashes and underscores.
        {#if suggestion && suggestion !== name}
          <button class="suggest" onclick={() => (name = suggestion)}>Use {suggestion}</button>
        {/if}
      </span>
    {:else if taken}
      <span class="error txt-body-s-regular">
        {owner.type === "org" ? `${node.ownerHandle(owner)} already has` : "You already have"} a repository called {name}.
      </span>
    {:else if name}
      <span class="muted txt-body-s-regular">
        It'll live at <span class="mono">{node.ownerHandle(owner)}/{name}</span>.
      </span>
    {/if}
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
      <Button variant="naked" onclick={() => window.history.back()}>Cancel</Button>
      <Button variant="secondary" disabled={!valid || taken} onclick={create}>Create repository</Button>
    </div>
  </div>
</div>
