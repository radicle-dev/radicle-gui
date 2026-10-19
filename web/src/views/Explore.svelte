<script lang="ts">
  import { untrack } from "svelte";

  import { node } from "@app/node/node.svelte";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";

  interface Props {
    q: string;
  }

  const { q }: Props = $props();
  let query = $state(untrack(() => q));

  const match = (s: string) => s.toLowerCase().includes(query.trim().toLowerCase());
  const repos = $derived(
    node.repos
      .filter(r => r.visibility === "public")
      .filter(r => !query || match(r.name) || match(r.description))
      .sort((a, b) => b.seedCount - a.seedCount),
  );
  const people = $derived(
    Object.values(node.world.people).filter(
      p => p.id !== "self" && (!query || match(p.alias) || match(p.name) || match(p.bio)),
    ),
  );
  const orgs = $derived(
    Object.values(node.world.orgs).filter(o => !query || match(o.name) || match(o.description)),
  );
</script>

<style>
  h1 {
    font: var(--txt-heading-xl);
    margin: 0 0 0.25rem;
  }
  .lede {
    color: var(--color-text-tertiary);
    margin: 0 0 1.5rem;
    font: var(--txt-body-m-regular);
  }
  .search {
    max-width: 32rem;
    margin-bottom: 2rem;
    font: var(--txt-body-l-regular);
    padding: 0.625rem 0.875rem;
  }
  section {
    margin-bottom: 2.5rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }
  .entity {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.875rem 1rem;
  }
  .entity a {
    text-decoration: none;
    color: inherit;
    flex: 1;
    min-width: 0;
  }
  .entity .name {
    font: var(--txt-body-m-semibold);
  }
  .entity .sub {
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
  }
</style>

<div class="page">
  <h1>Explore</h1>
  <p class="lede">What your node and its {node.network.peers.length} peers know about.</p>
  <input class="input search" bind:value={query} placeholder="Search the network" />

  {#if orgs.length > 0}
    <section>
      <h2 class="section-title">Organizations</h2>
      <div class="grid">
        {#each orgs as org (org.id)}
          {@const member = org.members.some(m => m.person === "self")}
          <div class="card entity">
            <Avatar org={org.id} size="2.5rem" />
            <a href={`/${org.handle}`}>
              <div class="name ellipsis">{org.name}</div>
              <div class="sub ellipsis">{org.members.length} members · {org.description}</div>
            </a>
            {#if !member}
              <Button
                variant={node.following[org.id] ? "ghost" : "outline"}
                styleHeight="1.75rem"
                onclick={() => node.do({ type: "follow", id: org.id, on: !node.following[org.id] })}>
                {node.following[org.id] ? "Following" : "Follow"}
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section>
    <h2 class="section-title">Repositories</h2>
    <div class="grid">{#each repos as repo (repo.rid)}<RepoCard {repo} />{/each}</div>
  </section>

  {#if people.length > 0}
    <section>
      <h2 class="section-title">People</h2>
      <div class="grid">
        {#each people as p (p.id)}
          <div class="card entity">
            <Avatar person={p.id} size="2.5rem" />
            <a href={`/@${p.alias}`}>
              <div class="name ellipsis">{p.name} <span class="muted">{p.alias}</span></div>
              <div class="sub ellipsis">{p.bio}</div>
            </a>
            <Button
              variant={node.following[p.id] ? "ghost" : "outline"}
              styleHeight="1.75rem"
              onclick={() => node.do({ type: "follow", id: p.id, on: !node.following[p.id] })}>
              {node.following[p.id] ? "Following" : "Follow"}
            </Button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
