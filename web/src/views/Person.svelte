<script lang="ts">
  import { dayKey } from "@app/lib/activity";
  import { contributionsOf } from "@app/lib/contributions";
  import { navigate } from "@app/lib/router.svelte";
  import { copy, plural, shortNid } from "@app/lib/utils";
  import { ridFor } from "@app/node/hash";
  import { node } from "@app/node/node.svelte";
  import { setFollow } from "@app/lib/actions";

  import ActivityList from "@app/components/ActivityList.svelte";
  import Avatar from "@app/components/Avatar.svelte";
  import Button from "@app/components/Button.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Heatmap from "@app/components/Heatmap.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Hint from "@app/components/Hint.svelte";
  import RepoCard from "@app/components/RepoCard.svelte";
  import Tabs from "@app/components/Tabs.svelte";

  interface Props {
    alias: string;
    tab: string;
    // Narrows the activity tab to one day (YYYY-MM-DD).
    day?: string;
  }

  const { alias, tab, day }: Props = $props();

  const person = $derived(node.personByAlias(alias));
  const isSelf = $derived(person?.id === "self");
  const following = $derived(person ? node.following[person.id] : false);
  const activity = $derived(person ? contributionsOf(person.id) : []);
  const owned = $derived(person ? node.reposOf({ type: "person", id: person.id }) : []);
  const maintains = $derived(
    person ? node.repos.filter(r => r.delegates.includes(person.id) && !owned.includes(r)) : [],
  );
  const contributes = $derived(
    person
      ? node.repos.filter(
          r =>
            !owned.includes(r) &&
            !maintains.includes(r) &&
            activity.some(a => a.repo === r && (a.kind === "commit" || a.kind === "patch")),
        )
      : [],
  );
  const orgs = $derived(person ? node.orgsOf(person.id) : []);
  const localTime = $derived.by(() => {
    if (!person?.timezone) return undefined;
    try {
      return new Date().toLocaleTimeString(undefined, {
        timeZone: person.timezone,
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return undefined;
    }
  });
  const base = $derived(`/@${alias}`);
</script>

<style>
  .profile {
    display: grid;
    grid-template-columns: 17rem minmax(0, 1fr);
    gap: 3rem;
  }
  .card-side {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .big-avatar :global(.avatar) {
    box-shadow: 0 0 0 1px var(--color-border-subtle);
  }
  h1 {
    font: var(--txt-heading-xl);
    margin: 0;
  }
  .alias {
    font: var(--txt-body-l-regular);
    color: var(--color-text-tertiary);
  }
  .bio {
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
    margin: 0;
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font: var(--txt-body-m-regular);
    color: var(--color-text-secondary);
  }
  .did {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  .orgs {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .actor {
    padding: 0.875rem 1rem;
    font: var(--txt-body-s-regular);
    color: var(--color-text-tertiary);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .actor strong {
    color: var(--color-text-primary);
    font: var(--txt-body-m-semibold);
  }
  section {
    margin: 1.75rem 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }
  @media (max-width: 860px) {
    .profile {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .day-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .profile-action {
    display: flex;
  }
</style>

<div class="page">
  {#if !person}
    <Empty icon="avatar-incognito" title={`No one called @${alias} on your node`}>
      Aliases are local names. Try searching by DID.
    </Empty>
  {:else}
    <div class="profile">
      <div class="card-side">
        <div class="big-avatar"><Avatar person={person.id} size="10rem" /></div>
        <div>
          <h1>{person.name || person.alias}</h1>
          <div class="alias">
            {person.alias}{#if person.pronouns}&nbsp;·&nbsp;{person.pronouns}{/if}
          </div>
        </div>
        {#if person.bio}<p class="bio">{person.bio}</p>{/if}
        <div class="profile-action">
          {#if isSelf}
            <Button variant="ghost" onclick={() => navigate("/settings?section=profile")}>
              <Icon name="edit" /> Edit profile
            </Button>
          {:else}
            <Button
              variant={following ? "ghost" : "secondary"}
              onclick={() => setFollow(person.id, !following)}>
              {following ? "Following" : "Follow"}
            </Button>
          {/if}
        </div>
        <div class="facts">
          {#if person.location}<span class="row"><Icon name="globe" />{person.location}</span>{/if}
          {#if localTime}<span class="row"><Icon name="clock" />{localTime} local time</span>{/if}
          {#if person.website}
            <a class="row link" href={person.website} target="_blank" rel="noreferrer"><Icon name="link" />{person.website.replace(/^https?:\/\//, "")}</a>
          {/if}
          <span class="row"><Icon name="key" />{plural(person.keys, "device key")}</span>
        </div>
        <div class="did">
          <span class="ellipsis">did:key:{shortNid(person.nid)}</span>
          <Button variant="naked" styleHeight="1.5rem" onclick={() => copy(person.did, "DID")}>
            <Icon name="copy" />
          </Button>
        </div>
        {#if orgs.length > 0}
          <div>
            <h2 class="section-title">Organizations</h2>
            <div class="orgs">
              {#each orgs as org (org.id)}
                <a href={`/${org.handle}`} title={org.name}><Avatar org={org.id} size="2rem" /></a>
              {/each}
            </div>
          </div>
        {/if}
        <Hint id="profile-repository">
          <div class="card actor">
            <strong>Profile repository</strong>
            This profile is itself a repository, signed by {person.alias}'s
            {plural(person.keys, "key")}. It syncs like any other repo.
            <span class="mono">{ridFor(`actor:${person.id}`)}</span>
          </div>
        </Hint>
      </div>

      <div>
        <Tabs
          tabs={[
            { label: "Overview", href: base, active: tab === "overview" },
            {
              label: "Repositories",
              href: `${base}?tab=repos`,
              active: tab === "repos",
              count: owned.length + maintains.length + contributes.length,
            },
            { label: "Activity", href: `${base}?tab=activity`, active: tab === "activity" },
          ]} />

        {#if tab === "repos"}
          {#each [{ title: "Owns", repos: owned }, { title: "Maintains", repos: maintains }, { title: "Contributes to", repos: contributes }] as group (group.title)}
            {#if group.repos.length > 0}
              <section>
                <h2 class="section-title">{group.title}</h2>
                <div class="grid">{#each group.repos as repo (repo.rid)}<RepoCard {repo} />{/each}</div>
              </section>
            {/if}
          {/each}
        {:else if tab === "activity"}
          {#if day}
            <section>
              <div class="day-head">
                <h2 class="section-title">
                  {new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </h2>
                <a class="link txt-body-s-regular" href={`${base}?tab=activity`}>Show all activity</a>
              </div>
              <ActivityList items={activity.filter(a => dayKey(a.time) === day)} />
            </section>
          {:else}
            <section><ActivityList items={activity} /></section>
          {/if}
        {:else}
          <section>
            <Heatmap items={activity} dayHref={d => `${base}?tab=activity&day=${d}`} />
          </section>
          {#if owned.length + maintains.length > 0}
            <section>
              <h2 class="section-title">Repositories</h2>
              <div class="grid">
                {#each [...owned, ...maintains].slice(0, 4) as repo (repo.rid)}<RepoCard {repo} />{/each}
              </div>
            </section>
          {/if}
          <section>
            <h2 class="section-title">Recent activity</h2>
            <ActivityList items={activity.slice(0, 10)} />
          </section>
        {/if}
      </div>
    </div>
  {/if}
</div>
