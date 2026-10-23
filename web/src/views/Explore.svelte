<script lang="ts">
  import { untrack } from "svelte";

  import { node } from "@app/node/node.svelte";
  import { setFollow } from "@app/lib/actions";
  import { chooseSeed, exploreSeed } from "@app/lib/exploreSeed.svelte";
  import { navigate } from "@app/lib/router.svelte";
  import { orgsOn, peopleOn, reposOn } from "@app/lib/seedContent";
  import { LOCAL_NODE, SEED_NODES } from "@app/node/seedNodes";

  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";
  import SeedSelector from "@app/components/SeedSelector.svelte";

  interface Props {
    q: string;
    seed?: string;
  }

  const { q, seed: seedParam }: Props = $props();
  let query = $state(untrack(() => q));

  // A seed in the URL wins, so links to an exploration keep their seed.
  $effect(() => {
    if (seedParam) chooseSeed(seedParam);
  });
  const seed = $derived(exploreSeed.current);
  const seedInfo = $derived(SEED_NODES.find(s => s.host === seed));

  function changeSeed(next: string) {
    chooseSeed(next);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one call, never reactive
    const params = new URLSearchParams();
    params.set("seed", next);
    if (query.trim()) params.set("q", query.trim());
    navigate(`/explore?${params}`, { replace: true, scroll: false });
  }

  const match = (s: string) => s.toLowerCase().includes(query.trim().toLowerCase());
  const repos = $derived(
    reposOn(seed)
      .filter(r => !query || match(r.name) || match(r.description) || match(node.ownerHandle(r.owner)))
      .sort((a, b) => b.seedCount - a.seedCount),
  );
  const people = $derived(
    peopleOn(seed).filter(p => !query || match(p.alias) || match(p.name) || match(p.bio)),
  );
  const orgs = $derived(
    orgsOn(seed).filter(o => !query || match(o.name) || match(o.handle) || match(o.description)),
  );
</script>

<style>
  .title {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.25rem;
  }
  h1 {
    font: var(--txt-heading-xl);
    margin: 0;
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
  <div class="title">
    <h1>Explore</h1>
    <SeedSelector value={seed} onchange={changeSeed} />
  </div>
  <p class="lede">
    {#if seed === LOCAL_NODE}
      What your node stores. Pick a seed node to browse what's on the network.
    {:else}
      Browsing {seed}. {seedInfo?.description}
    {/if}
  </p>
  <input
    class="input search"
    bind:value={query}
    placeholder={seed === LOCAL_NODE ? "Search your node" : `Search ${seed}`} />

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
                onclick={() => setFollow(org.id, !node.following[org.id])}>
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
    <div class="grid">
      {#each repos as repo (repo.rid)}<RepoCard {repo} />{:else}<span class="muted">Nothing matches on {seed === LOCAL_NODE ? "your node" : seed}.</span>{/each}
    </div>
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
              onclick={() => setFollow(p.id, !node.following[p.id])}>
              {node.following[p.id] ? "Following" : "Follow"}
            </Button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
