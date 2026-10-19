<script lang="ts">
  import type { PersonId } from "@app/node/model";

  import { navigate } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";

  let step = $state<1 | 2 | 3>(1);
  let name = $state("");
  let handle = $state("");
  let handleTouched = $state(false);
  let description = $state("");
  let invite = $state<PersonId[]>([]);
  let threshold = $state(1);

  $effect(() => {
    if (!handleTouched) {
      handle = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
  });

  const total = $derived(invite.length + 1);
  const handleTaken = $derived(Object.values(node.world.orgs).some(o => o.handle === handle));
  const handleValid = $derived(/^[a-z0-9][a-z0-9-]{1,38}$/.test(handle) && !handleTaken);
  const people = $derived(
    Object.values(node.world.people)
      .filter(p => p.id !== "self")
      .sort((a, b) => Number(!!node.following[b.id]) - Number(!!node.following[a.id])),
  );

  $effect(() => {
    if (threshold > total) threshold = total;
  });

  function create() {
    node.do({
      type: "createOrg",
      handle,
      name: name.trim(),
      description: description.trim(),
      invite,
      threshold,
    });
    navigate(`/${handle}`);
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
  .steps {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }
  .steps span {
    flex: 1;
    height: 0.25rem;
    border-radius: var(--border-radius-full);
    background: var(--color-surface-strong);
  }
  .steps span.on {
    background: var(--color-surface-brand-primary);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .handle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .handle span {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  .person {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    font: var(--txt-body-m-regular);
  }
  .person:last-child {
    border-bottom: none;
  }
  .person .sub {
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .following {
    margin-left: auto;
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .options {
    display: flex;
    flex-direction: column;
  }
  .option {
    display: flex;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    cursor: pointer;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .option + .option {
    border-top: 1px solid var(--color-border-subtle);
  }
  .option strong {
    display: block;
    color: var(--color-text-primary);
  }
  .summary {
    padding: 1.25rem;
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }
  .summary .name {
    font: var(--txt-heading-m);
  }
  .avatars {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }
  .error {
    color: var(--color-feedback-error-text);
    font: var(--txt-body-s-regular);
  }
</style>

<div class="page-narrow">
  <h1>New organization</h1>
  <p class="lede">
    An org is a shared identity for a group. Its members sign changes together, so it
    keeps working when someone leaves or loses a key.
  </p>
  <div class="steps">
    <span class:on={step >= 1}></span><span class:on={step >= 2}></span><span class:on={step >= 3}></span>
  </div>

  <div class="form">
    {#if step === 1}
      <div class="field">
        <label for="org-name">Name</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="org-name" class="input" bind:value={name} autofocus placeholder="Harbor Collective" />
      </div>
      <div class="field">
        <label for="org-handle">Handle</label>
        <div class="handle">
          <span>radicle /</span>
          <input
            id="org-handle"
            class="input"
            bind:value={handle}
            oninput={() => (handleTouched = true)} />
        </div>
        {#if handleTaken}<span class="error">An org with this handle is already on your node.</span>{/if}
        <span class="hint">Handles are how people link to the org and its repos.</span>
      </div>
      <div class="field">
        <label for="org-desc">What is it for?</label>
        <textarea id="org-desc" class="textarea" style="min-height: 4.5rem;" bind:value={description}></textarea>
      </div>
      <div class="row" style="justify-content: flex-end;">
        <Button variant="secondary" disabled={!name.trim() || !handleValid} onclick={() => (step = 2)}>Continue</Button>
      </div>
    {:else if step === 2}
      <div class="field">
        <span class="label">Invite members</span>
        <span class="hint">They'll get an invite in their inbox. You can add more later.</span>
      </div>
      <div class="card">
        {#each people as p (p.id)}
          <label class="person">
            <input
              type="checkbox"
              checked={invite.includes(p.id)}
              onchange={() =>
                (invite = invite.includes(p.id) ? invite.filter(x => x !== p.id) : [...invite, p.id])} />
            <Avatar person={p.id} size="1.75rem" />
            <div>
              <div>{p.name} <span class="muted">{p.alias}</span></div>
              <div class="sub">{p.bio}</div>
            </div>
            {#if node.following[p.id]}<span class="following">Following</span>{/if}
          </label>
        {/each}
      </div>
      <div class="row" style="justify-content: space-between;">
        <Button variant="naked" onclick={() => (step = 1)}>Back</Button>
        <Button variant="secondary" onclick={() => (step = 3)}>
          {invite.length === 0 ? "Skip for now" : "Continue"}
        </Button>
      </div>
    {:else}
      <div class="field">
        <span class="label">How many members must approve changes?</span>
        <span class="hint">
          Applies to adding or removing members and editing the org. Repositories keep
          their own maintainer rules.
        </span>
      </div>
      <div class="card options">
        {#each Array(total) as _, i (i)}
          <label class="option">
            <input type="radio" bind:group={threshold} value={i + 1} />
            <div>
              <strong>{i + 1} of {total}</strong>
              {i + 1 === 1
                ? total === 1
                  ? "Just you, for now. Raise it once members join."
                  : "Any one member can change the org. Fast, but one lost key is enough to take it over."
                : i + 1 === total
                  ? "Everyone must agree. Safest, but one unavailable member blocks changes."
                  : i + 1 > total / 2
                    ? "A majority. A good balance for most groups."
                    : "Less than a majority."}
            </div>
          </label>
        {/each}
      </div>
      <div class="card summary">
        <Icon name="badge" size="32" />
        <div>
          <div class="name">{name}</div>
          <div class="muted txt-body-m-regular">{handle} · {threshold} of {total} sign changes</div>
          <div class="avatars">
            <Avatar person="self" size="1.5rem" />
            {#each invite as p (p)}<Avatar person={p} size="1.5rem" />{/each}
          </div>
        </div>
      </div>
      <div class="row" style="justify-content: space-between;">
        <Button variant="naked" onclick={() => (step = 2)}>Back</Button>
        <Button variant="secondary" onclick={create}>Create organization</Button>
      </div>
    {/if}
  </div>
</div>
