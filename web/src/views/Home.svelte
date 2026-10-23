<script lang="ts">
  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Hint from "@app/components/Hint.svelte";
  import InboxRow from "@app/components/InboxRow.svelte";
  import RepoAvatar from "@app/components/RepoAvatar.svelte";
  import WorkRow from "@app/components/WorkRow.svelte";
  import { navigate } from "@app/lib/router.svelte";
  import { scrollBehavior } from "@app/lib/motion";
  import { plural, timeAgo } from "@app/lib/utils";

  const inbox = $derived(node.inbox);
  const needsYou = $derived(inbox.filter(i => i.needsYou).slice(0, 6));
  const recent = $derived(inbox.filter(i => !i.needsYou).slice(0, 8));

  // What the header leads with: how much is waiting on you, and what kind.
  const waiting = $derived(inbox.filter(i => i.needsYou));
  const headline = $derived(
    waiting.length === 0
      ? "Hey, you're all caught up"
      : `Hey, ${waiting.length} ${waiting.length === 1 ? "thing needs" : "things need"} you`,
  );

  // Your own open patches and where each one stands, the ones you can act on
  // first.
  const myPatches = $derived(
    node.repos
      .flatMap(repo =>
        repo.patches
          .filter(
            p =>
              p.author === "self" &&
              (p.state === "open" || p.state === "draft"),
          )
          .map(patch => {
            const latest = node.latestRevision(patch);
            const accepts = latest.reviews.filter(
              r => r.verdict === "accept" && repo.delegates.includes(r.author),
            ).length;
            const rejected = latest.reviews.some(r => r.verdict === "reject");
            const ready =
              patch.state === "open" && !rejected && accepts >= repo.threshold;
            return { repo, patch, ready, rejected, updated: latest.time };
          }),
      )
      .sort((a, b) => rank(a) - rank(b) || b.updated - a.updated),
  );
  function rank(p: {
    ready: boolean;
    rejected: boolean;
    patch: { state: string };
  }) {
    return p.ready ? 0 : p.rejected ? 1 : p.patch.state === "draft" ? 3 : 2;
  }
  function patchStatus(p: (typeof myPatches)[number]) {
    if (p.ready) return { label: "Ready to merge", tone: "good" as const };
    if (p.rejected) return { label: "Changes requested", tone: "bad" as const };
    if (p.patch.state === "draft") return { label: "Draft" };
    return { label: "Awaiting review" };
  }

  // Open issues assigned to you or opened by you, assigned ones first.
  const myIssues = $derived(
    node.repos
      .flatMap(repo =>
        repo.issues
          .filter(
            i =>
              i.state === "open" &&
              (i.assignees.includes("self") || i.author === "self"),
          )
          .map(issue => ({
            repo,
            issue,
            assigned: issue.assignees.includes("self"),
            updated: Math.max(issue.time, ...issue.comments.map(c => c.time)),
          })),
      )
      .sort(
        (a, b) =>
          Number(b.assigned) - Number(a.assigned) || b.updated - a.updated,
      ),
  );

  const SHOWN = 6;
  let allPatches = $state(false);
  let allIssues = $state(false);

  function jumpTo(e: MouseEvent, id: string) {
    e.preventDefault();
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }
  // Where your patches stand, leaving out states with nothing in them.
  const patchSummary = $derived(
    [
      [myPatches.filter(p => p.ready).length, "ready to merge"],
      [
        myPatches.filter(p => !p.ready && !p.rejected).length,
        "awaiting review",
      ],
      [myPatches.filter(p => p.rejected).length, "changes requested"],
    ]
      .filter(([n]) => (n as number) > 0)
      .map(([n, label]) => `${n} ${label}`)
      .join(" · "),
  );

  const online = $derived(node.network.status === "online");
</script>

<style>
  /* Both columns line up on their first line of text, so the sidebar's
     heading shares the headline's baseline. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18rem;
    align-items: baseline;
    gap: 2.5rem;
  }
  h1 {
    font: var(--txt-heading-xl);
    margin: 0;
  }
  /* The headline and what makes it up, sharing a baseline. */
  .headline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    margin-bottom: 1.25rem;
  }
  /* Keeps section headings clear of the sticky header when jumped to. */
  .anchored {
    scroll-margin-top: 4.5rem;
  }
  .show-all {
    all: unset;
    cursor: pointer;
    margin-top: 0.5rem;
    font: var(--txt-body-s-medium);
    color: var(--color-text-tertiary);
  }
  .show-all:hover {
    color: var(--color-text-primary);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 2.5rem;
  }
  .stat {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.875rem 1rem;
    color: inherit;
    text-decoration: none;
  }
  .stat-icon {
    position: absolute;
    top: 0.875rem;
    right: 0.875rem;
    display: inline-flex;
    color: var(--color-text-tertiary);
  }
  .stat:hover .stat-icon {
    color: var(--color-text-primary);
  }
  .stat-value {
    font: var(--txt-heading-l);
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }
  .stat-sub {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
  @media (max-width: 700px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
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
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .head .section-title {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .head-right {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }
  .head-right .link {
    flex-shrink: 0;
  }
  .section-sub {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
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
    color: var(--color-text-brand);
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
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .seed-avatar {
    display: inline-flex;
    flex-shrink: 0;
  }
</style>

<div class="page">
  <div class="layout">
    <div>
      <div class="headline">
        <h1>{headline}</h1>
      </div>

      <section>
        <div class="card list">
          {#each needsYou as item (item.id)}
            <InboxRow {item} unread={!node.read[item.id]} showNeeds={false} />
          {:else}
            <div class="all-clear">
              <Icon name="checkmark" /> Nothing waiting on you.
            </div>
          {/each}
        </div>
      </section>
      <div class="stats">
        <a
          class="card stat"
          href="#your-patches"
          title={patchSummary || undefined}
          onclick={e => jumpTo(e, "your-patches")}>
          <span class="stat-icon"><Icon name="patch" /></span>
          <span class="stat-value">{myPatches.length}</span>
          <span class="stat-sub">
            open {myPatches.length === 1 ? "patch" : "patches"}
          </span>
        </a>
        <a class="card stat" href="/inbox">
          <span class="stat-icon"><Icon name="inbox" /></span>
          <span class="stat-value">{node.unreadCount}</span>
          <span class="stat-sub">unread</span>
        </a>
        <a
          class="card stat"
          href="#your-issues"
          onclick={e => jumpTo(e, "your-issues")}>
          <span class="stat-icon"><Icon name="issue" /></span>
          <span class="stat-value">{myIssues.length}</span>
          <span class="stat-sub">
            open {myIssues.length === 1 ? "issue" : "issues"}
          </span>
        </a>
        <a
          class="card stat"
          href="/node"
          title={`Seeding ${node.seededRepos.length} repositories`}>
          <span class="stat-icon"><Icon name="online" /></span>
          <span class="stat-value">{node.network.peers.length}</span>
          <span class="stat-sub">
            {node.network.peers.length === 1 ? "peer" : "peers"}
            {online ? "connected" : "so far"}
          </span>
        </a>
      </div>

      <section id="your-patches" class="anchored">
        <div class="head">
          <h2 class="section-title">Your patches</h2>
          <span class="head-right">
            <span class="section-sub">Patches authored by you</span>
          </span>
        </div>
        <div class="card list">
          {#each allPatches ? myPatches : myPatches.slice(0, SHOWN) as p (p.patch.id)}
            <WorkRow
              kind="patch"
              state={p.patch.state}
              title={p.patch.title}
              meta={`${node.ownerHandle(p.repo.owner)}/${p.repo.name} · ${plural(p.patch.revisions.length, "revision")} · updated ${timeAgo(p.updated)}`}
              href={`${node.repoPath(p.repo)}/patches/${p.patch.id}`}
              status={patchStatus(p)} />
          {:else}
            <div class="all-clear"><Icon name="patch" /> No open patches.</div>
          {/each}
        </div>
        {#if myPatches.length > SHOWN}
          <button class="show-all" onclick={() => (allPatches = !allPatches)}>
            {allPatches ? "Show fewer" : `Show all ${myPatches.length}`}
          </button>
        {/if}
      </section>

      <section id="your-issues" class="anchored">
        <div class="head">
          <h2 class="section-title">Your issues</h2>
          <span class="head-right">
            <span class="section-sub">Issues authored by or assigned to you</span>
          </span>
        </div>
        <div class="card list">
          {#each allIssues ? myIssues : myIssues.slice(0, SHOWN) as i (i.issue.id)}
            <WorkRow
              kind="issue"
              state={i.issue.state}
              title={i.issue.title}
              meta={`${node.ownerHandle(i.repo.owner)}/${i.repo.name} · ${i.issue.author === "self" ? "opened by you" : `opened by ${node.person(i.issue.author).alias}`} · updated ${timeAgo(i.updated)}`}
              href={`${node.repoPath(i.repo)}/issues/${i.issue.id}`}
              status={i.assigned
                ? { label: "Assigned to you", tone: "brand" }
                : undefined} />
          {:else}
            <div class="all-clear">
              <Icon name="issue" /> No open issues assigned to you or opened by you.
            </div>
          {/each}
        </div>
        {#if myIssues.length > SHOWN}
          <button class="show-all" onclick={() => (allIssues = !allIssues)}>
            {allIssues ? "Show fewer" : `Show all ${myIssues.length}`}
          </button>
        {/if}
      </section>

      <section>
        <div class="head">
          <h2 class="section-title">Recent activity</h2>
          <span class="head-right">
            <span class="section-sub">
              Updates on repos you maintain and threads you're in
            </span>
          </span>
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
          <span class="head-right">
            <span class="section-sub">Orgs you're in</span>
            <a class="link" href="/orgs/new">New</a>
          </span>
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
            {#if pending > 0}<span class="pending">
                {pending} to approve
              </span>{/if}
          </a>
        {:else}
          <p class="muted txt-body-m-regular">You're not in any orgs yet.</p>
        {/each}
      </div>

      {#if node.seededRepos.length > 0}
        <div>
          <div class="head">
            <h2 class="section-title">Seeding</h2>
            <span class="head-right">
              <span class="section-sub">Served by your node</span>
              <a class="link" href="/node">Manage</a>
            </span>
          </div>
          {#each node.seededRepos as repo (repo.rid)}
            <a class="org" href={node.repoPath(repo)}>
              <span class="seed-avatar">
                <RepoAvatar
                  name={repo.name}
                  rid={repo.rid}
                  styleWidth="1.25rem" />
              </span>
              <span class="name ellipsis">
                {node.ownerHandle(repo.owner)}/{repo.name}
              </span>
            </a>
          {/each}
        </div>
      {/if}

      {#if node.identity && !node.identity.recoverySaved}
        <Hint id="home-one-key">
          <div class="card callout">
            <strong>Only one key</strong>
            Your identity lives in this browser alone. Save a recovery key or add
            another device so you don't lose access.
            <div>
              <Button
                variant="ghost"
                onclick={() => navigate("/settings?section=keys")}>
                <Icon name="key" /> Secure your identity
              </Button>
            </div>
          </div>
        </Hint>
      {/if}

      <Hint id="home-keep-tab-open">
        <div class="card callout">
          <strong>Keep this tab open to seed</strong>
          Your node runs in this tab. While it's open you serve your repos to peers;
          when it's closed, seed nodes keep them available.
          <div><a class="link" href="/node">Node details →</a></div>
        </div>
      </Hint>
    </aside>
  </div>
</div>
