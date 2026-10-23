<script lang="ts">
  import type { IdentityChange, IdentityRevision, PersonId, Repo } from "@app/node/model";

  import { copy, fullDate, plural, shortId, timeAgo } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";
  import { announceIdentity, proposeIdentity } from "@app/lib/actions";
  import { describeChange, majority, rawIdentity, revisionTitle } from "@app/node/repoIdentity";

  import Button from "@app/components/Button.svelte";
  import Dropdown from "@app/components/Dropdown.svelte";
  import SegmentedSwitch from "@app/components/SegmentedSwitch.svelte";
  import Icon from "@app/components/Icon.svelte";
  import IdChip from "@app/components/IdChip.svelte";
  import Markdown from "@app/components/Markdown.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";

  interface Props {
    repo: Repo;
  }

  const { repo }: Props = $props();

  const current = $derived(node.currentIdentity(repo));
  const doc = $derived(current.doc);
  const pending = $derived(node.pendingIdentity(repo));
  const delegate = $derived(doc.delegates.includes("self"));
  const history = $derived([...repo.identity.revisions].filter(r => r.state !== "active").reverse());
  const alias = (p: PersonId) => node.person(p).alias;

  let showRaw = $state(false);
  let expanded = $state<string | undefined>(undefined);

  // Proposing
  let proposing = $state(false);
  let kind = $state<IdentityChange["type"]>("addDelegate");
  let person = $state<string>("");
  let threshold = $state(1);
  let visibility = $state<"public" | "private">("public");
  let description = $state("");
  let branch = $state("");
  let reason = $state("");

  const candidates = $derived(
    Object.values(node.world.people).filter(
      p => !p.id.startsWith("agent-") && !doc.delegates.includes(p.id),
    ),
  );

  function openForm() {
    proposing = true;
    threshold = doc.threshold;
    visibility = doc.visibility === "public" ? "private" : "public";
    description = doc.description;
    branch = doc.defaultBranch;
    person = "";
  }

  const change = $derived.by((): IdentityChange | undefined => {
    switch (kind) {
      case "addDelegate":
        return person ? { type: "addDelegate", person: person as PersonId } : undefined;
      case "removeDelegate":
        return person ? { type: "removeDelegate", person: person as PersonId } : undefined;
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
      default:
        return undefined;
    }
  });

  function propose() {
    if (!change) return;
    proposeIdentity(repo, change, reason);
    proposing = false;
    reason = "";
  }

  function vote(revision: string, approve: boolean) {
    node.do({ type: "idVote", rid: repo.rid, revision, approve });
    announceIdentity(repo, revision, approve);
  }

  function parentDoc(rev: IdentityRevision) {
    return repo.identity.revisions.find(r => r.id === rev.parent)?.doc;
  }

  function voters(rev: IdentityRevision): PersonId[] {
    return parentDoc(rev)?.delegates ?? [rev.author];
  }
</script>

<style>
  .main {
    max-width: 56rem;
    margin: 0 auto;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  h1 {
    font: var(--txt-heading-m);
    margin: 0;
    flex: 1;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
  }
  .lede {
    margin: 0 0 1.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  section {
    margin-bottom: 2rem;
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .section-head .section-title {
    margin: 0;
  }
  .note {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .delegates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .fields {
    display: grid;
    grid-template-columns: 12rem minmax(0, 1fr);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
  }
  .fields > * {
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
  .fields > :nth-last-child(-n + 2) {
    border-bottom: none;
  }
  .label {
    color: var(--color-text-tertiary);
  }
  .value {
    color: var(--color-text-primary);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .hint {
    color: var(--color-text-tertiary);
  }
  .rule {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    margin-bottom: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .pattern {
    font: var(--txt-code-regular);
    color: var(--color-text-primary);
  }
  pre {
    margin: 0.75rem 0 0;
    padding: 0.875rem 1rem;
    font: var(--txt-code-small);
    background: var(--color-surface-subtle);
    border-radius: var(--border-radius-sm);
    overflow-x: auto;
  }
  .proposal {
    background: color-mix(in srgb, var(--color-surface-brand-primary) 6%, var(--color-surface-canvas));
    border: 1px solid color-mix(in srgb, var(--color-surface-brand-primary) 30%, transparent);
    border-radius: var(--border-radius-sm);
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .proposal .top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    font: var(--txt-body-m-regular);
  }
  .proposal .what {
    font: var(--txt-body-m-medium);
  }
  .changes {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .sigs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font: var(--txt-body-m-regular);
  }
  .sig {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  .yes {
    color: var(--color-feedback-success-text);
    display: inline-flex;
  }
  .no {
    color: var(--color-feedback-error-text);
    display: inline-flex;
  }
  .none {
    color: var(--color-text-quaternary);
    display: inline-flex;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: flex-end;
  }
  .timeline {
    position: relative;
  }
  .timeline::before {
    content: "";
    position: absolute;
    top: 1rem;
    bottom: 1rem;
    left: 1rem;
    width: 1px;
    background: var(--color-border-mid);
  }
  .entry {
    position: relative;
  }
  .row-button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    font: var(--txt-body-m-regular);
  }
  .row-button:hover {
    background: var(--color-surface-subtle);
  }
  .icon {
    width: 1rem;
    display: inline-flex;
    justify-content: center;
    background: var(--color-surface-canvas);
    position: relative;
    z-index: 1;
  }
  .row-button:hover .icon {
    background: var(--color-surface-subtle);
  }
  .entry-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .current-chip {
    font: var(--txt-body-s-medium);
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-feedback-success-bg);
    color: var(--color-feedback-success-text);
  }
  .rejected-chip {
    font: var(--txt-body-s-medium);
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-feedback-error-bg);
    color: var(--color-feedback-error-text);
  }
  .detail {
    margin: 0 0 0.75rem 2rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-canvas);
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .detail .head {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
    margin-bottom: 0.25rem;
  }
  .form {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--border-radius-sm);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  @media (max-width: 760px) {
    .fields {
      grid-template-columns: 1fr;
    }
  }
  .signed {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.5rem;
    padding: 0 0.5rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-s-medium);
    color: var(--color-feedback-success-text);
    background: color-mix(in srgb, var(--color-feedback-success-text) 12%, transparent);
  }
</style>

<div class="main">
  <div class="title-row">
    <h1>Identity document</h1>
    {#if delegate && !proposing}
      <Button variant="secondary" onclick={openForm}>
        <Icon name="edit" />Propose a change
      </Button>
    {/if}
  </div>
  <div class="meta">
    <span>Current revision</span>
    <IdChip id={current.id} label="revision ID" />
    <span title={fullDate(current.time)}>adopted {timeAgo(current.time)}</span>
  </div>
  <p class="lede">
    The rules every node uses for {repo.name}: who its delegates are, and how many must agree
    before a change to {doc.defaultBranch} counts. Changing it takes {majority(doc)} of
    {plural(doc.delegates.length, "delegate")} signing.
  </p>

  {#if proposing}
    <div class="form">
      <span class="txt-body-m-semibold">Propose a change</span>
      <div class="field">
        <label for="kind">Change</label>
        <Dropdown
          id="kind"
          options={[
            { value: "addDelegate", label: "Add a delegate", icon: "plus" },
            { value: "removeDelegate", label: "Remove a delegate", icon: "minus" },
            { value: "setThreshold", label: "Change the default-branch threshold", icon: "comment-checkmark" },
            { value: "setVisibility", label: "Change visibility", icon: "globe" },
            { value: "setDescription", label: "Edit the description", icon: "edit" },
            { value: "setDefaultBranch", label: "Change the default branch", icon: "branch" },
          ]}
          value={kind}
          onchange={v => (kind = v as typeof kind)} />
      </div>
      {#if kind === "addDelegate"}
        <div class="field">
          <label for="person">Person</label>
          <Dropdown
            id="person"
            options={candidates.map(p => ({ value: p.id, label: p.alias, description: p.name, person: p.id }))}
            value={person || undefined}
            onchange={v => (person = v)}
            placeholder="Choose someone…" />
        </div>
      {:else if kind === "removeDelegate"}
        <div class="field">
          <label for="person">Delegate</label>
          <Dropdown
            id="person"
            options={doc.delegates.map(d => ({ value: d as string, label: d === "self" ? `${alias(d)} (you)` : alias(d), person: d }))}
            value={person || undefined}
            onchange={v => (person = v)}
            placeholder="Choose a delegate…" />
        </div>
      {:else if kind === "setThreshold"}
        <div class="field">
          <label for="threshold">Delegates who must agree on {doc.defaultBranch}</label>
          <SegmentedSwitch
            options={doc.delegates.map((_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            value={String(threshold)}
            onchange={v => (threshold = Number(v))} />
        </div>
      {:else if kind === "setVisibility"}
        <div class="field">
          <label for="vis">Visibility</label>
          <Dropdown
            id="vis"
            options={[
              { value: "public", label: "Public", icon: "globe" },
              { value: "private", label: "Private", icon: "lock" },
            ]}
            value={visibility}
            onchange={v => (visibility = v as "public" | "private")} />
        </div>
      {:else if kind === "setDescription"}
        <div class="field">
          <label for="desc">Description</label>
          <input id="desc" class="input" bind:value={description} />
        </div>
      {:else}
        <div class="field">
          <label for="branch">Default branch</label>
          <input id="branch" class="input mono" bind:value={branch} />
        </div>
      {/if}
      <div class="field">
        <label for="reason">Why <span class="muted">(optional)</span></label>
        <textarea id="reason" class="textarea" style="min-height: 4rem;" bind:value={reason}></textarea>
      </div>
      {#if change}
        <span class="note">{describeChange(change, alias)}. Your signature counts as 1 of the {majority(doc)} needed.</span>
      {/if}
      <div class="actions">
        <Button variant="naked" onclick={() => (proposing = false)}>Cancel</Button>
        <Button variant="secondary" disabled={!change} onclick={propose}>Sign &amp; propose</Button>
      </div>
    </div>
  {/if}

  {#if pending.length > 0}
    <section>
      <div class="section-head">
        <h2 class="section-title">Waiting for signatures</h2>
      </div>
      {#each pending as rev (rev.id)}
        {@const signed = rev.accepted.filter(p => voters(rev).includes(p)).length}
        {@const needed = parentDoc(rev) ? majority(parentDoc(rev)!) : 1}
        <div class="proposal" id={`revision-${rev.id}`}>
          <div class="top">
            <PersonLink person={rev.author} size="1rem" />
            <span class="caption">proposed</span>
            <span class="what">{revisionTitle(rev, alias)}</span>
            <span class="caption" title={fullDate(rev.time)}>{timeAgo(rev.time)}</span>
          </div>
          {#if rev.changes.length > 1}
            <ul class="changes">
              {#each rev.changes as c, i (i)}<li>{describeChange(c, alias)}</li>{/each}
            </ul>
          {/if}
          {#if rev.description}<Markdown content={rev.description} compact />{/if}
          <div class="sigs">
            {#each voters(rev) as v (v)}
              <span class="sig">
                {#if rev.accepted.includes(v)}
                  <span class="yes"><Icon name="checkmark" /></span>
                {:else if rev.rejected.includes(v)}
                  <span class="no"><Icon name="close" /></span>
                {:else}
                  <span class="none"><Icon name="minus" /></span>
                {/if}
                <PersonLink person={v} size="1rem" />
              </span>
            {/each}
          </div>
          <div class="actions">
            <span class="note" style="margin-right: auto;">{signed} of {needed} signatures needed</span>
            {#if voters(rev).includes("self")}
              {#if rev.accepted.includes("self")}
                <span class="signed"><Icon name="checkmark" /> Signed by you</span>
                {#if rev.author !== "self"}
                  <Button variant="naked" onclick={() => vote(rev.id, false)}>Reject</Button>
                {/if}
              {:else}
                {#if !rev.rejected.includes("self")}
                  <Button variant="naked" onclick={() => vote(rev.id, false)}>Reject</Button>
                {/if}
                <Button variant="secondary" onclick={() => vote(rev.id, true)}>Sign</Button>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <section>
    <div class="section-head">
      <h2 class="section-title">Delegates</h2>
      <span class="note">{majority(doc)} of {doc.delegates.length} must sign to change this document</span>
    </div>
    <div class="delegates">
      {#each doc.delegates as d (d)}<PersonLink person={d} size="1rem" chip />{/each}
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2 class="section-title">Document</h2>
      <Button variant="naked" onclick={() => (showRaw = !showRaw)}>
        <Icon name="code" />{showRaw ? "Hide raw" : "View raw"}
      </Button>
    </div>
    <div class="fields">
      <span class="label">Name</span><span class="value">{doc.name}</span>
      <span class="label">Description</span><span class="value">{doc.description}</span>
      <span class="label">Default branch</span><span class="value mono">{doc.defaultBranch}</span>
      <span class="label">Visibility</span>
      <span class="value">{doc.visibility === "public" ? "Public" : "Private"}</span>
      <span class="label">Default-branch threshold</span>
      <span class="value">
        {doc.threshold} of {doc.delegates.length}
        <span class="hint">· delegates whose {doc.defaultBranch} must contain a commit for it to become canonical</span>
      </span>
      <span class="label">Repository ID</span>
      <span class="value row">
        <span class="mono">{repo.rid}</span>
        <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(repo.rid, "repository ID")}><Icon name="copy" /></Button>
      </span>
    </div>
    {#if showRaw}
      <pre>{rawIdentity(doc, node.world.people)}</pre>
    {/if}
  </section>

  <section>
    <div class="section-head">
      <h2 class="section-title">Canonical refs</h2>
      <span class="note">Which refs everyone treats as the real ones</span>
    </div>
    {#each doc.canonicalRefs as rule (rule.pattern)}
      <div class="rule">
        <span class="pattern">{rule.pattern}</span>
        <span>
          {#if rule.allow === "delegates"}
            canonical once {rule.threshold} of {doc.delegates.length} delegates {rule.threshold === 1 ? "agrees" : "agree"}
          {:else}
            canonical once {rule.threshold} of {rule.allow.map(alias).join(", ")} agree
          {/if}
        </span>
      </div>
    {/each}
  </section>

  <section>
    <div class="section-head">
      <h2 class="section-title">History</h2>
      <span class="note">{plural(repo.identity.revisions.length, "revision")}</span>
    </div>
    <div class="timeline">
      {#each history as rev (rev.id)}
        {@const open = expanded === rev.id}
        <div class="entry">
          <button class="row-button" onclick={() => (expanded = open ? undefined : rev.id)}>
            <span class="icon">
              {#if rev.state === "rejected"}
                <span class="no"><Icon name="close" /></span>
              {:else}
                <Icon name={rev.parent ? "revision" : "key"} />
              {/if}
            </span>
            <PersonLink person={rev.author} size="1rem" />
            <span class="entry-title">{revisionTitle(rev, alias)}</span>
            {#if rev.id === current.id}<span class="current-chip">Current</span>{/if}
            {#if rev.state === "rejected"}<span class="rejected-chip">Rejected</span>{/if}
            <span class="caption mono txt-body-s-regular">{shortId(rev.id)}</span>
            <span class="caption" title={fullDate(rev.time)}>{timeAgo(rev.time)}</span>
            <Icon name={open ? "chevron-up" : "chevron-down"} />
          </button>
          {#if open}
            <div class="detail">
              {#if rev.description}
                <div><div class="head">Description</div><Markdown content={rev.description} compact /></div>
              {/if}
              <div>
                <div class="head">Changes</div>
                <ul class="changes">
                  {#each rev.changes as c, i (i)}<li>{describeChange(c, alias)}</li>{/each}
                </ul>
              </div>
              <div>
                <div class="head">
                  Signatures
                  {#if rev.parent}· {rev.accepted.length} of {voters(rev).length} delegates signed, {majority(parentDoc(rev)!)} needed{/if}
                </div>
                <div class="sigs">
                  {#each voters(rev) as v (v)}
                    <span class="sig">
                      {#if rev.accepted.includes(v)}
                        <span class="yes"><Icon name="checkmark" /></span>
                      {:else if rev.rejected.includes(v)}
                        <span class="no"><Icon name="close" /></span>
                      {:else}
                        <span class="none"><Icon name="minus" /></span>
                      {/if}
                      <PersonLink person={v} size="1rem" />
                    </span>
                  {/each}
                </div>
                {#if !rev.parent}
                  <span class="note">The first revision is accepted when it's created, with its author's signature.</span>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>
</div>
