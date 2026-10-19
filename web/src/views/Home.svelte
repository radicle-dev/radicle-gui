<script lang="ts">
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import InboxRow from "@app/components/InboxRow.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";
  import { navigate } from "@app/lib/router.svelte";

  const self = $derived(node.person("self"));
  const inbox = $derived(node.inbox);
  const needsYou = $derived(inbox.filter(i => i.needsYou).slice(0, 6));
  const recent = $derived(inbox.filter(i => !i.needsYou).slice(0, 8));

  const myRepos = $derived(
    node.repos.filter(
      r =>
        node.isDelegate(r) ||
        (r.owner.type === "person" && r.owner.id === "self"),
    ),
  );
  const contributing = $derived(
    node.repos.filter(
      r =>
        !myRepos.includes(r) &&
        (r.patches.some(p => p.author === "self") ||
          Object.values(r.commits).some(c => c.author === "self")),
    ),
  );

  const seededOnly = $derived(
    node.seededRepos.filter(r => !myRepos.includes(r) && !contributing.includes(r)),
  );

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  });
</script>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18rem;
    gap: 2.5rem;
  }
  h1 {
    font: var(--txt-heading-xl);
    margin: 0 0 0.25rem;
  }
  .lede {
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
    margin: 0 0 2rem;
  }
  section {
    margin-bottom: 2.5rem;
  }
  .list {
    overflow: hidden;
  }
  .list :global(a:last-child) {
    border-bottom: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .head a {
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .org {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem;
    margin: 0 -0.5rem;
    border-radius: var(--border-radius-sm);
    text-decoration: none;
    color: inherit;
  }
  .org:hover {
    background: var(--color-surface-subtle);
  }
  .org .name {
    font: var(--txt-body-m-semibold);
  }
  .org .sub {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  .pending {
    margin-left: auto;
    font: var(--txt-body-s-semibold);
    color: var(--color-feedback-important-text);
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  .callout {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .callout strong {
    color: var(--color-text-primary);
  }
  .all-clear {
    padding: 1.25rem 1rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    color: var(--color-text-tertiary);
    font: var(--txt-body-m-regular);
  }
  @media (max-width: 960px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="page">
  <div class="layout">
    <div>
      <h1>{greeting}, {self.name || self.alias}</h1>
      <p class="lede">
        Your node is seeding {node.seededRepos.length} repositories ·
        {node.network.peers.length} peers connected
      </p>

      <section>
        <div class="head">
          <h2 class="section-title">Needs you</h2>
          <a class="link" href="/inbox">Inbox</a>
        </div>
        <div class="card list">
          {#each needsYou as item (item.id)}
            <InboxRow {item} unread={!node.read[item.id]} />
          {:else}
            <div class="all-clear"><Icon name="checkmark" /> Nothing waiting on you.</div>
          {/each}
        </div>
      </section>

      <section>
        <div class="head">
          <h2 class="section-title">Your repositories</h2>
          <a class="link" href="/new">New</a>
        </div>
        <div class="grid">
          {#each myRepos as repo (repo.rid)}<RepoCard {repo} />{/each}
        </div>
      </section>

      {#if contributing.length > 0}
        <section>
          <h2 class="section-title">Contributing to</h2>
          <div class="grid">
            {#each contributing as repo (repo.rid)}<RepoCard {repo} />{/each}
          </div>
        </section>
      {/if}

      <section>
        <div class="head">
          <h2 class="section-title">Recent activity</h2>
        </div>
        <div class="card list">
          {#each recent as item (item.id)}
            <InboxRow {item} unread={!node.read[item.id]} />
          {/each}
        </div>
      </section>
    </div>

    <aside>
      <div>
        <div class="head">
          <h2 class="section-title">Your organizations</h2>
          <a class="link" href="/orgs/new">New</a>
        </div>
        {#each node.myOrgs as org (org.id)}
          {@const pending = org.proposals.filter(
            p => p.state === "open" && !p.approvals.includes("self"),
          ).length}
          <a class="org" href={`/${org.handle}`}>
            <Avatar org={org.id} size="2rem" />
            <div class="stack" style="gap: 0;">
              <span class="name">{org.name}</span>
              <span class="sub">{org.members.length} members</span>
            </div>
            {#if pending > 0}<span class="pending">{pending} to approve</span>{/if}
          </a>
        {:else}
          <p class="muted txt-body-m-regular">You're not in any orgs yet.</p>
        {/each}
      </div>

      {#if seededOnly.length > 0}
        <div>
          <h2 class="section-title">Also seeding</h2>
          {#each seededOnly as repo (repo.rid)}
            <a class="org" href={node.repoPath(repo)}>
              <Icon name="seed" />
              <span class="name ellipsis">{node.ownerHandle(repo.owner)}/{repo.name}</span>
            </a>
          {/each}
        </div>
      {/if}

      {#if node.identity && !node.identity.recoverySaved}
        <div class="card callout">
          <strong>Only one key</strong>
          Your identity lives in this browser alone. Save a recovery key or add
          another device so you don't lose access.
          <div>
            <Button variant="ghost" onclick={() => navigate("/settings?section=keys")}>
              <Icon name="key" /> Secure your identity
            </Button>
          </div>
        </div>
      {/if}

      <div class="card callout">
        <strong>Keep this tab open to seed</strong>
        Your node runs in this tab. While it's open you serve your repos to peers;
        when it's closed, seed nodes keep them available.
        <div><a class="link" href="/node">Node details →</a></div>
      </div>
    </aside>
  </div>
</div>
