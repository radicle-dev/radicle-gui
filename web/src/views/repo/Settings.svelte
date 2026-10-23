<script lang="ts">
  import type { IdentityChange, PersonId, Repo } from "@app/node/model";

  import { untrack } from "svelte";

  import { proposeIdentity, setSeed } from "@app/lib/actions";
  import { navigate } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";
  import { describeChange, majority, revisionTitle } from "@app/node/repoIdentity";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Dropdown from "@app/components/Dropdown.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Icon from "@app/components/Icon.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";

  interface Props {
    repo: Repo;
  }

  const { repo }: Props = $props();

  const base = $derived(node.repoPath(repo));
  const delegate = $derived(node.isDelegate(repo));
  const doc = $derived(node.currentIdentity(repo).doc);
  const pending = $derived(node.pendingIdentity(repo));
  const alias = (p: PersonId) => node.person(p).alias;

  // The form starts from the current identity document and is compared
  // against it to work out what changed.
  let name = $state("");
  let description = $state("");
  let visibility = $state<"public" | "private">("public");
  let branch = $state("");
  let delegates = $state<PersonId[]>([]);
  let threshold = $state(1);
  let adding = $state("");
  let reason = $state("");

  function reset() {
    name = doc.name;
    description = doc.description;
    visibility = doc.visibility;
    branch = doc.defaultBranch;
    delegates = [...doc.delegates];
    threshold = doc.threshold;
    adding = "";
    reason = "";
  }
  untrack(reset);

  const branches = $derived(Object.keys(repo.branches).sort());
  const candidates = $derived(
    Object.values(node.world.people).filter(p => !p.id.startsWith("agent-") && !delegates.includes(p.id)),
  );
  const nameTaken = $derived(
    name.trim() !== doc.name &&
      node.repos.some(
        r => r !== repo && r.name === name.trim() && r.owner.type === repo.owner.type && r.owner.id === repo.owner.id,
      ),
  );
  const nameValid = $derived(/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name.trim()) && !nameTaken);

  // Adds and removals first, so the threshold is checked against the new set.
  const changes = $derived.by((): IdentityChange[] => {
    const out: IdentityChange[] = [];
    if (name.trim() && name.trim() !== doc.name) out.push({ type: "setName", name: name.trim() });
    if (description.trim() !== doc.description) out.push({ type: "setDescription", description: description.trim() });
    if (visibility !== doc.visibility) out.push({ type: "setVisibility", visibility });
    if (branch && branch !== doc.defaultBranch) out.push({ type: "setDefaultBranch", branch });
    for (const d of delegates) if (!doc.delegates.includes(d)) out.push({ type: "addDelegate", person: d });
    for (const d of doc.delegates) if (!delegates.includes(d)) out.push({ type: "removeDelegate", person: d });
    const t = Math.min(threshold, delegates.length);
    if (t !== doc.threshold) out.push({ type: "setThreshold", threshold: t });
    return out;
  });
  const needed = $derived(majority(doc));
  const valid = $derived(nameValid && delegates.length > 0 && changes.length > 0);

  $effect(() => {
    if (threshold > delegates.length) threshold = Math.max(1, delegates.length);
  });

  function changeIcon(c: IdentityChange) {
    switch (c.type) {
      case "setVisibility":
        return c.visibility === "private" ? ("lock" as const) : ("globe" as const);
      case "setDefaultBranch":
        return "branch" as const;
      case "setThreshold":
        return "comment-checkmark" as const;
      default:
        return "edit" as const;
    }
  }

  function submit() {
    if (!valid) return;
    // Held onto because a rename changes the URL this page was found by.
    const target = repo;
    const renaming = changes.some(c => c.type === "setName");
    const id = proposeIdentity(target, changes, reason);
    const applied = target.identity.revisions.find(r => r.id === id)?.state === "accepted";
    if (applied && renaming) navigate(`${node.repoPath(target)}/settings`, { replace: true });
    else reset();
  }
</script>

<style>
  .page-settings {
    max-width: 44rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  h1 {
    font: var(--txt-heading-l);
    margin: 0 0 0.25rem;
  }
  .lede {
    margin: 0;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  .hint {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .error {
    font: var(--txt-body-s-regular);
    color: var(--color-feedback-error-text);
  }
  .options {
    display: flex;
    flex-direction: column;
  }
  .option {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    cursor: pointer;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .option:last-child {
    border-bottom: none;
  }
  .option strong {
    display: block;
    color: var(--color-text-primary);
  }
  .person {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .person.removed :global(a) {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .person .tag {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .person .end {
    margin-left: auto;
  }
  .add {
    display: flex;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
  }
  .threshold {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .threshold {
    flex-wrap: wrap;
  }
  .pending {
    display: flex;
    gap: 0.625rem;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, var(--color-surface-brand-primary) 30%, transparent);
    border-radius: var(--border-radius-sm);
    background: color-mix(in srgb, var(--color-surface-brand-primary) 6%, var(--color-surface-canvas));
    font: var(--txt-body-m-regular);
  }
  /* One text line tall, so the icon centres on the first line. */
  .pending-icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    height: 1.25rem;
    color: var(--color-text-secondary);
  }
  .row-between {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  /* Pinned to the bottom with the page fading up behind it, like the review
     bar on patches. */
  .dock {
    position: sticky;
    bottom: 0;
    padding: 2.5rem 0 1rem;
    background: linear-gradient(to top, var(--color-surface-canvas) 55%, transparent);
    pointer-events: none;
  }
  .bar {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    box-shadow: var(--elevation-low);
  }
  .bar-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .change-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .change-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .change-icon {
    display: inline-flex;
    flex-shrink: 0;
    width: 1rem;
    justify-content: center;
    color: var(--color-text-tertiary);
  }
  .bar-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>

{#if !delegate}
  <Empty icon="lock" title="Only delegates can change settings">
    The repository's settings live in its identity document, which only its delegates can sign.
    <a class="link" href={`${base}/identity`}>See the identity document</a>
  </Empty>
{:else}
  <div class="page-settings">
    <div>
      <h1>Settings</h1>
      <p class="lede">
        These live in the repository's identity document. Changing them proposes a new revision that
        {needed === 1 ? "your signature alone applies" : `${needed} of ${doc.delegates.length} delegates must sign`}.
      </p>
    </div>

    {#if pending.length > 0}
      <div class="pending">
        <span class="pending-icon"><Icon name="clock" /></span>
        <span>
          {pending.length === 1 ? "A change is" : `${pending.length} changes are`} already waiting for signatures:
          {pending.map(r => revisionTitle(r, alias)).join(", ")}.
          <a class="link" href={`${base}/identity`}>Review</a>
        </span>
      </div>
    {/if}

    <section>
      <h2 class="section-title">General</h2>
      <div class="card panel">
        <div class="field">
          <label for="repo-name">Name</label>
          <input id="repo-name" class="input mono" bind:value={name} />
          {#if nameTaken}
            <span class="error">There's already a repository called {name.trim()} here.</span>
          {:else if !nameValid}
            <span class="error">Use letters, numbers, dots, dashes and underscores.</span>
          {:else if name.trim() !== doc.name}
            <span class="hint">Links to the old name stop working once the rename is adopted.</span>
          {/if}
        </div>
        <div class="field">
          <label for="repo-description">Description</label>
          <textarea id="repo-description" class="textarea" style="min-height: 4.5rem;" bind:value={description}></textarea>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">Visibility</h2>
      <div class="card options">
        <label class="option">
          <input type="radio" bind:group={visibility} value="public" />
          <span><strong>Public</strong>Anyone on the network can find, seed and clone it.</span>
        </label>
        <label class="option">
          <input type="radio" bind:group={visibility} value="private" />
          <span>
            <strong>Private</strong>Only shared with delegates and people you allow. Copies peers already have stay with them.
          </span>
        </label>
      </div>
    </section>

    <section>
      <h2 class="section-title">Default branch</h2>
      <div class="card panel">
        <Dropdown
          options={branches.map(b => ({ value: b, label: b, icon: "branch" as const, mono: true }))}
          value={branch}
          onchange={v => (branch = v)}
          ariaLabel="Default branch"
          styleWidth="20rem" />
        <span class="hint">The branch delegates agree on, and the one people clone and patch against.</span>
      </div>
    </section>

    <section>
      <h2 class="section-title">Maintainers</h2>
      <div class="card">
        {#each [...new Set([...doc.delegates, ...delegates])] as d (d)}
          {@const removed = !delegates.includes(d)}
          {@const added = !doc.delegates.includes(d)}
          <div class="person" class:removed>
            <PersonLink person={d} size="1.5rem" />
            {#if added}<span class="tag">Being added</span>{/if}
            {#if removed}<span class="tag">Being removed</span>{/if}
            <span class="end">
              {#if removed}
                <Button variant="naked" styleHeight="1.75rem" onclick={() => (delegates = [...delegates, d])}>Undo</Button>
              {:else if delegates.length > 1}
                <Button
                  variant="naked"
                  styleHeight="1.75rem"
                  title={`Remove ${alias(d)}`}
                  onclick={() => (delegates = delegates.filter(x => x !== d))}>
                  Remove
                </Button>
              {/if}
            </span>
          </div>
        {/each}
        <div class="add">
          <div style="flex: 1; min-width: 0;">
            <Dropdown
              options={candidates.map(p => ({ value: p.id, label: p.alias, description: p.name, person: p.id }))}
              value={adding || undefined}
              onchange={v => (adding = v)}
              placeholder="Add a maintainer…" />
          </div>
          <Button
            variant="ghost"
            styleHeight="2.25rem"
            disabled={!adding}
            onclick={() => {
              delegates = [...delegates, adding as PersonId];
              adding = "";
            }}>
            <Icon name="plus" /> Add
          </Button>
        </div>
      </div>
      <div class="threshold">
        <SegmentedSwitch
          options={delegates.map((_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          value={String(Math.min(threshold, delegates.length))}
          onchange={v => (threshold = Number(v))} />
        <span>of {delegates.length} must agree for a change to {branch || doc.defaultBranch} to count</span>
      </div>
    </section>

    <section>
      <h2 class="section-title">Ryph</h2>
      <div class="card panel">
        <div class="row-between">
          {#if node.ryphFor(repo)}
            <span>Connected to <span class="mono">{node.ryphFor(repo)?.instance}</span></span>
            <Button variant="ghost" onclick={() => navigate(`${base}/ryph`)}>Manage</Button>
          {:else}
            <span class="hint">Let Ryph agents work on issues and patches here when someone asks them to.</span>
            <Button variant="ghost" onclick={() => navigate(`${base}/ryph`)}>Connect Ryph</Button>
          {/if}
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">On your node</h2>
      <div class="card panel">
        <div class="row-between">
          <span class="hint">
            {node.seeding[repo.rid]
              ? "Your node stores this repository and serves it to peers."
              : "Your node doesn't store this repository."}
          </span>
          <Button variant="ghost" onclick={() => setSeed(repo, !node.seeding[repo.rid])}>
            <Icon name={node.seeding[repo.rid] ? "seed-filled" : "seed"} />
            {node.seeding[repo.rid] ? "Stop seeding" : "Seed"}
          </Button>
        </div>
      </div>
    </section>

    {#if changes.length > 0}
      <div class="dock">
        <div class="card bar">
          <div class="bar-head">
            <span class="txt-body-m-semibold">
              {changes.length} {changes.length === 1 ? "change" : "changes"} to {needed === 1 ? "apply" : "propose"}
            </span>
            <span class="hint">
              {needed === 1 ? "Your signature is enough." : `Needs ${needed} of ${doc.delegates.length} delegate signatures.`}
            </span>
          </div>
          <div class="change-list">
            {#each changes as c, i (i)}
              <div class="change-row">
                <span class="change-icon">
                  {#if c.type === "addDelegate" || c.type === "removeDelegate"}
                    <Avatar person={c.person} size="1rem" />
                  {:else}
                    <Icon name={changeIcon(c)} />
                  {/if}
                </span>
                {describeChange(c, alias)}
              </div>
            {/each}
          </div>
          <input class="input" bind:value={reason} placeholder="Why? (optional)" />
          <div class="bar-actions">
            <Button variant="naked" onclick={reset}>Discard</Button>
            <Button variant="secondary" disabled={!valid} onclick={submit}>
              {needed === 1 ? "Sign & apply" : "Propose changes"}
            </Button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
