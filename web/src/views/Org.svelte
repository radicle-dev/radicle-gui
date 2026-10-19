<script lang="ts">
  import type { PersonId } from "@app/node/model";

  import { activityOf } from "@app/lib/activity";
  import { navigate } from "@app/lib/router.svelte";
  import { copy, plural, shortDate } from "@app/lib/utils";
  import { node } from "@app/node/node.svelte";

  import ActivityList from "@app/components/ActivityList.svelte";
  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Icon from "@app/components/Icon.svelte";
  import PersonLink from "@app/components/PersonLink.svelte";
  import ProposalCard from "@app/components/ProposalCard.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";
  import Tabs from "@app/components/Tabs.svelte";

  interface Props {
    handle: string;
    tab: string;
  }

  const { handle, tab }: Props = $props();

  const org = $derived(node.orgByHandle(handle));
  const me = $derived(org?.members.find(m => m.person === "self"));
  const following = $derived(org ? node.following[org.id] : false);
  const repos = $derived(org ? node.reposOf({ type: "org", id: org.id }) : []);
  const open = $derived(org?.proposals.filter(p => p.state === "open") ?? []);
  const waiting = $derived(open.filter(p => !p.approvals.includes("self") && !p.rejections.includes("self")));
  const activity = $derived(
    org
      ? Object.values(node.world.people)
          .flatMap(p => activityOf(p.id, repos, r => node.repoPath(r)))
          .sort((a, b) => b.time - a.time)
      : [],
  );
  const base = $derived(`/${handle}`);

  // Invite
  let inviting = $state(false);
  let invitee = $state<PersonId | "">("");
  let inviteRole = $state<"member" | "admin">("member");
  const candidates = $derived(
    Object.values(node.world.people).filter(
      p => p.id !== "self" && !org?.members.some(m => m.person === p.id),
    ),
  );

  function invite() {
    if (!org || !invitee) return;
    node.do({
      type: "propose",
      org: org.id,
      title: `Add ${node.person(invitee).alias} as ${inviteRole === "admin" ? "an admin" : "a member"}`,
      change: { type: "addMember", person: invitee, role: inviteRole },
    });
    inviting = false;
    invitee = "";
    navigate(`${base}?tab=approvals`);
  }

  // Settings
  let editName = $state("");
  let editDescription = $state("");
  let editThreshold = $state(1);
  $effect(() => {
    if (org) {
      editName = org.name;
      editDescription = org.description;
      editThreshold = org.threshold;
    }
  });

  function proposeSettings() {
    if (!org) return;
    if (editName.trim() && editName.trim() !== org.name) {
      node.do({
        type: "propose",
        org: org.id,
        title: "Rename the org",
        change: { type: "editProfile", field: "name", value: editName.trim() },
      });
    }
    if (editDescription.trim() !== org.description) {
      node.do({
        type: "propose",
        org: org.id,
        title: "Update the description",
        change: { type: "editProfile", field: "description", value: editDescription.trim() },
      });
    }
    if (editThreshold !== org.threshold) {
      node.do({
        type: "propose",
        org: org.id,
        title: `Change approvals needed to ${editThreshold}`,
        change: { type: "setThreshold", threshold: editThreshold },
      });
    }
    navigate(`${base}?tab=approvals`);
  }
</script>

<style>
  .hero {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  h1 {
    font: var(--txt-heading-xxl);
    margin: 0 0 0.25rem;
  }
  .handle {
    color: var(--color-text-tertiary);
    font: var(--txt-body-l-regular);
  }
  .desc {
    margin: 0.75rem 0 0;
    font: var(--txt-body-l-regular);
    color: var(--color-text-secondary);
    max-width: 40rem;
  }
  .facts {
    display: flex;
    gap: 1.25rem;
    margin-top: 0.75rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-tertiary);
    flex-wrap: wrap;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .role {
    font: var(--txt-body-s-semibold);
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-full);
    padding: 0.125rem 0.5rem;
    color: var(--color-text-secondary);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    gap: 2.5rem;
    margin-top: 1.75rem;
  }
  .layout.full {
    grid-template-columns: minmax(0, 1fr);
  }
  section {
    margin-bottom: 2rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }
  .member {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-subtle);
    font: var(--txt-body-m-regular);
  }
  .member:last-child {
    border-bottom: none;
  }
  .member .since {
    margin-left: auto;
    color: var(--color-text-tertiary);
    font: var(--txt-body-s-regular);
  }
  .callout {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .callout strong {
    color: var(--color-text-primary);
  }
  .callout.attention {
    border-color: var(--color-feedback-warning-border);
  }
  .members-mini {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .stack-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .form {
    max-width: 36rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .invite {
    padding: 1rem;
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .invite .field {
    flex: 1;
    min-width: 10rem;
  }
  @media (max-width: 960px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

<div class="page">
  {#if !org}
    <Empty icon="badge" title={`Nothing called “${handle}” on your node`}>
      It may be a repository path missing its owner, or an org your peers don't know.
    </Empty>
  {:else}
    <div class="hero">
      <Avatar org={org.id} size="5rem" />
      <div style="flex: 1; min-width: 16rem;">
        <h1>{org.name}</h1>
        <div class="handle">{org.handle} · Organization</div>
        <p class="desc">{org.description}</p>
        <div class="facts">
          <span class="row"><Icon name="badge" />{plural(org.members.length, "member")}</span>
          <span class="row"><Icon name="repository" />{plural(repos.length, "repository", "repositories")}</span>
          {#if org.location}<span class="row"><Icon name="globe" />{org.location}</span>{/if}
          {#if org.website}<span class="row"><Icon name="link" />{org.website.replace(/^https?:\/\//, "")}</span>{/if}
          <span class="row"><Icon name="key" />{org.threshold} of {org.members.length} sign changes</span>
        </div>
      </div>
      <div class="actions">
        {#if me}
          <span class="role">{me.role === "admin" ? "Admin" : "Member"}</span>
          <Button variant="ghost" onclick={() => (inviting = true, navigate(`${base}?tab=members`))}>
            <Icon name="plus" /> Invite
          </Button>
        {:else}
          <Button
            variant={following ? "ghost" : "secondary"}
            onclick={() => node.do({ type: "follow", id: org.id, on: !following })}>
            {following ? "Following" : "Follow"}
          </Button>
        {/if}
      </div>
    </div>

    <Tabs
      tabs={[
        { label: "Overview", href: base, active: tab === "overview", icon: "home" },
        { label: "Repositories", href: `${base}?tab=repos`, active: tab === "repos", icon: "repository", count: repos.length },
        { label: "Members", href: `${base}?tab=members`, active: tab === "members", icon: "badge", count: org.members.length },
        ...(me
          ? [
              { label: "Approvals", href: `${base}?tab=approvals`, active: tab === "approvals", icon: "comment-checkmark" as const, count: open.length },
              { label: "Settings", href: `${base}?tab=settings`, active: tab === "settings", icon: "settings" as const },
            ]
          : []),
      ]} />

    <div class="layout" class:full={tab !== "overview"}>
      <div>
        {#if tab === "repos"}
          <div class="grid">{#each repos as repo (repo.rid)}<RepoCard {repo} />{/each}</div>
        {:else if tab === "members"}
          {#if inviting && me}
            <div class="card invite">
              <div class="field">
                <label for="invitee">Invite someone</label>
                <select id="invitee" class="select" bind:value={invitee}>
                  <option value="">Choose a person you know…</option>
                  {#each candidates as p (p.id)}<option value={p.id}>{p.alias} · {p.name}</option>{/each}
                </select>
              </div>
              <div class="field" style="flex: 0 0 9rem;">
                <label for="role">Role</label>
                <select id="role" class="select" bind:value={inviteRole}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button variant="naked" onclick={() => (inviting = false)}>Cancel</Button>
              <Button variant="secondary" disabled={!invitee} onclick={invite}>Propose</Button>
              <span class="muted txt-body-s-regular" style="flex-basis: 100%;">
                Adding a member is a change to the org, so {org.threshold} of {org.members.length}
                members need to approve it. Your approval counts as the first.
              </span>
            </div>
          {/if}
          <div class="card">
            {#each org.members as m (m.person)}
              <div class="member">
                <PersonLink person={m.person} size="1.75rem" />
                <span class="muted">{node.person(m.person).name}</span>
                {#if m.role === "admin"}<span class="role">Admin</span>{/if}
                <span class="since">Since {shortDate(m.since)}</span>
              </div>
            {/each}
          </div>
        {:else if tab === "approvals" && me}
          <section>
            <h2 class="section-title">Open</h2>
            <div class="stack-list">
              {#each open as p (p.id)}<ProposalCard {org} proposal={p} />{:else}<Empty icon="checkmark" title="Nothing to approve">Changes to the org show up here until enough members sign them.</Empty>{/each}
            </div>
          </section>
          {#if org.proposals.some(p => p.state !== "open")}
            <section>
              <h2 class="section-title">History</h2>
              <div class="stack-list">
                {#each org.proposals.filter(p => p.state !== "open") as p (p.id)}<ProposalCard {org} proposal={p} />{/each}
              </div>
            </section>
          {/if}
        {:else if tab === "settings" && me}
          <div class="form">
            <p class="muted txt-body-m-regular" style="margin: 0;">
              Every change here becomes a proposal. It takes effect once {org.threshold} of
              {org.members.length} members approve it.
            </p>
            <div class="field">
              <label for="org-name">Name</label>
              <input id="org-name" class="input" bind:value={editName} />
            </div>
            <div class="field">
              <label for="org-desc">Description</label>
              <textarea id="org-desc" class="textarea" bind:value={editDescription}></textarea>
            </div>
            <div class="field">
              <label for="org-threshold">Approvals needed for changes</label>
              <select id="org-threshold" class="select" bind:value={editThreshold}>
                {#each Array(org.members.length) as _, i (i)}
                  <option value={i + 1}>{i + 1} of {org.members.length}{i + 1 > org.members.length / 2 ? "" : " (less than a majority)"}</option>
                {/each}
              </select>
              <span class="hint">More approvals make the org safer from a single lost key, but slower to change.</span>
            </div>
            <div class="row">
              <Button variant="secondary" onclick={proposeSettings}>Propose changes</Button>
            </div>
            <div class="card callout">
              <strong>Org identity</strong>
              <span class="mono txt-body-s-regular">{org.rid}</span>
              <div><Button variant="naked" onclick={() => copy(org.rid)}><Icon name="copy" /> Copy ID</Button></div>
            </div>
          </div>
        {:else}
          <section>
            <h2 class="section-title">Repositories</h2>
            <div class="grid">{#each repos as repo (repo.rid)}<RepoCard {repo} />{:else}<span class="muted">No repositories yet.</span>{/each}</div>
          </section>
          <section>
            <h2 class="section-title">Recent activity</h2>
            <ActivityList items={activity.slice(0, 10)} />
          </section>
        {/if}
      </div>

      {#if tab === "overview"}
        <aside class="stack" style="gap: 1.5rem;">
          {#if me && waiting.length > 0}
            <div class="card callout attention">
              <strong>{plural(waiting.length, "change")} waiting on you</strong>
              {waiting[0].title}, proposed by {node.person(waiting[0].author).alias}.
              <div><Button variant="secondary" onclick={() => navigate(`${base}?tab=approvals`)}>Review</Button></div>
            </div>
          {/if}
          <div>
            <h2 class="section-title">Members</h2>
            <div class="members-mini">
              {#each org.members as m (m.person)}
                <a href={`/@${node.person(m.person).alias}`}><Avatar person={m.person} size="2rem" /></a>
              {/each}
            </div>
          </div>
          <div class="card callout">
            <strong>How this org works</strong>
            The org is a repository its members sign together. Adding people, changing the
            profile or the rules takes {org.threshold} of {org.members.length} member
            signatures, so no single key controls it.
          </div>
        </aside>
      {/if}
    </div>
  {/if}
</div>
