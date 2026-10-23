<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";
  import type { IdentityChange, PersonId, Repo } from "@app/node/model";

  import { proposeIdentity } from "@app/lib/actions";
  import { node } from "@app/node/node.svelte";
  import { describeChange, majority } from "@app/node/repoIdentity";

  import Button from "./Button.svelte";
  import Dropdown from "./Dropdown.svelte";
  import SegmentedSwitch from "./SegmentedSwitch.svelte";
  import Popover, { closeFocused } from "./Popover.svelte";

  type Kind = Exclude<IdentityChange["type"], "init">;

  interface Props {
    repo: Repo;
    kind: Kind;
    // The delegate to remove, for `removeDelegate`.
    person?: PersonId;
    trigger: Snippet<[() => void]>;
    placement?: ComponentProps<typeof Popover>["placement"];
  }

  const { repo, kind, person, trigger, placement = "bottom-start" }: Props = $props();

  const doc = $derived(node.currentIdentity(repo).doc);
  const needed = $derived(majority(doc));
  const alias = (p: PersonId) => node.person(p).alias;

  let expanded = $state(false);
  let invitee = $state("");
  let threshold = $state(1);
  let visibility = $state<"public" | "private">("public");
  let description = $state("");
  let branch = $state("");
  let reason = $state("");

  $effect(() => {
    if (!expanded) return;
    invitee = "";
    threshold = doc.threshold;
    visibility = doc.visibility === "public" ? "private" : "public";
    description = doc.description;
    branch = doc.defaultBranch;
    reason = "";
  });

  const candidates = $derived(
    Object.values(node.world.people).filter(p => !p.id.startsWith("agent-") && !doc.delegates.includes(p.id)),
  );

  const titles: Record<Kind, string> = {
    setName: "Rename",
    addDelegate: "Add a maintainer",
    removeDelegate: "Remove maintainer",
    setThreshold: "Change approvals needed",
    setVisibility: "Change visibility",
    setDescription: "Edit description",
    setDefaultBranch: "Change default branch",
  };

  const change = $derived.by((): IdentityChange | undefined => {
    switch (kind) {
      case "setName":
        return undefined;
      case "addDelegate":
        return invitee ? { type: "addDelegate", person: invitee as PersonId } : undefined;
      case "removeDelegate":
        return person ? { type: "removeDelegate", person } : undefined;
      case "setThreshold":
        return threshold !== doc.threshold ? { type: "setThreshold", threshold } : undefined;
      case "setVisibility":
        return visibility !== doc.visibility ? { type: "setVisibility", visibility } : undefined;
      case "setDescription":
        return description.trim() && description.trim() !== doc.description
          ? { type: "setDescription", description: description.trim() }
          : undefined;
      case "setDefaultBranch":
        return branch.trim() && branch.trim() !== doc.defaultBranch
          ? { type: "setDefaultBranch", branch: branch.trim() }
          : undefined;
    }
  });

  const pending = $derived(
    node
      .pendingIdentity(repo)
      .filter(r => r.changes.some(c => c.type === kind && (kind !== "removeDelegate" || ("person" in c && c.person === person)))),
  );

  function submit() {
    if (!change) return;
    proposeIdentity(repo, change, reason);
    closeFocused();
  }
</script>

<style>
  .panel {
    width: 22rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.875rem;
    background: var(--color-surface-canvas);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-regular);
    color: var(--color-text-primary);
  }
  .title {
    font: var(--txt-body-m-semibold);
  }
  .note {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .pending {
    font: var(--txt-body-s-regular);
    color: var(--color-text-secondary);
    padding: 0.5rem 0.625rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-subtle);
  }
  .options {
    display: flex;
    gap: 0.5rem;
  }
  .options label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>

<Popover {placement} bind:expanded>
  {#snippet toggle(onclick)}{@render trigger(onclick)}{/snippet}
  {#snippet popover()}
    <div class="panel">
      <span class="title">{titles[kind]}</span>

      {#if kind === "addDelegate"}
        <Dropdown
          options={candidates.map(p => ({ value: p.id, label: p.alias, description: p.name, person: p.id }))}
          value={invitee || undefined}
          onchange={v => (invitee = v)}
          placeholder="Choose a person…" />
      {:else if kind === "removeDelegate" && person}
        <span>
          {alias(person)} will no longer be able to sign changes to this repository's
          canonical branches or its identity.
        </span>
      {:else if kind === "setThreshold"}
        <div class="row">
          <SegmentedSwitch
            options={doc.delegates.map((_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            value={String(threshold)}
            onchange={v => (threshold = Number(v))} />
          <span class="muted">of {doc.delegates.length} maintainers must agree for a change to {doc.defaultBranch} to count</span>
        </div>
      {:else if kind === "setVisibility"}
        <div class="options">
          <label><input type="radio" bind:group={visibility} value="public" /> Public</label>
          <label><input type="radio" bind:group={visibility} value="private" /> Private</label>
        </div>
        {#if visibility === "private" && doc.visibility === "public"}
          <span class="note">Only maintainers and people you allow will be able to fetch it. Copies peers already have stay with them.</span>
        {/if}
      {:else if kind === "setDescription"}
        <textarea class="textarea" bind:value={description} style="min-height: 4.5rem;"></textarea>
      {:else if kind === "setDefaultBranch"}
        <input class="input mono" bind:value={branch} />
      {/if}

      {#if kind !== "removeDelegate" || person}
        <input class="input" bind:value={reason} placeholder="Why? (optional)" />
      {/if}

      {#each pending as rev (rev.id)}
        <div class="pending">
          Already proposed: {describeChange(rev.changes[0], alias)} · {rev.accepted.length} of {needed} signed.
          <a class="link" href={`${node.repoPath(repo)}/identity`}>Review</a>
        </div>
      {/each}

      <span class="note">
        {#if needed === 1}
          Your signature is enough, so this applies right away.
        {:else}
          Changes the repository's identity, so {needed} of {doc.delegates.length} maintainers need to sign it.
          Until then everyone keeps seeing the current value.
        {/if}
      </span>

      <div class="actions">
        <Button variant="naked" onclick={closeFocused}>Cancel</Button>
        <Button variant="secondary" disabled={!change} onclick={submit}>
          {needed === 1 ? "Sign & apply" : "Propose change"}
        </Button>
      </div>
    </div>
  {/snippet}
</Popover>
