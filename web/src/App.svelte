<script lang="ts">
  import { untrack } from "svelte";

  import { highlightTarget } from "@app/lib/highlight";
  import { navigate, router } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";

  import Header from "@app/components/Header.svelte";
  import Empty from "@app/components/Empty.svelte";
  import Explore from "@app/views/Explore.svelte";
  import Home from "@app/views/Home.svelte";
  import Inbox from "@app/views/Inbox.svelte";
  import NewOrg from "@app/views/NewOrg.svelte";
  import NewRepo from "@app/views/NewRepo.svelte";
  import NodePage from "@app/views/NodePage.svelte";
  import Org from "@app/views/Org.svelte";
  import Person from "@app/views/Person.svelte";
  import Repo from "@app/views/repo/Repo.svelte";
  import Settings from "@app/views/Settings.svelte";
  import Toasts from "@app/components/Toasts.svelte";
  import ConfirmHost from "@app/components/ConfirmHost.svelte";
  import Welcome from "@app/views/Welcome.svelte";

  const route = $derived(router.route);

  // Following a link to a spot on a page, like a notification's comment,
  // scrolls to it and briefly highlights it.
  // Runs on load and after each followed link, not on Back and Forward.
  $effect(() => {
    void router.visits;
    const id = untrack(() => router.hash.slice(1));
    if (id) untrack(() => highlightTarget(decodeURIComponent(id)));
  });

  $effect(() => {
    if (!node.ready && route.name !== "welcome") {
      navigate("/welcome", { replace: true });
    }
  });

  $effect(() => {
    const titles: Record<string, string> = {
      home: "Home",
      inbox: "Inbox",
      explore: "Explore",
      node: "Node",
      settings: "Settings",
      newRepo: "New repository",
      newOrg: "New organization",
      welcome: "Welcome",
    };
    const r = route;
    const title =
      r.name === "repo"
        ? `${r.owner}/${r.repo}`
        : r.name === "person"
          ? `@${r.alias}`
          : r.name === "org"
            ? r.handle
            : titles[r.name];
    document.title = title ? `${title} · Radicle` : "Radicle";
  });
</script>



{#if route.name === "welcome" || !node.ready}
  <Welcome />
{:else}
  <Header />
  <main>
    {#if route.name === "home"}
      <Home />
    {:else if route.name === "inbox"}
      <Inbox filter={route.filter} />
    {:else if route.name === "explore"}
      <Explore q={route.q} seed={route.seed} />
    {:else if route.name === "node"}
      <NodePage />
    {:else if route.name === "settings"}
      <Settings section={route.section} />
    {:else if route.name === "newRepo"}
      <NewRepo owner={route.owner} />
    {:else if route.name === "newOrg"}
      <NewOrg />
    {:else if route.name === "person"}
      <Person alias={route.alias} tab={route.tab} day={route.day} />
    {:else if route.name === "org"}
      <Org handle={route.handle} tab={route.tab} />
    {:else if route.name === "repo"}
      <Repo owner={route.owner} name={route.repo} view={route.view} />
    {:else}
      <div class="page">
        <Empty icon="sad-emoji" title="Nothing here">
          This page doesn't exist on your node. <a class="link" href="/">Go home</a>
        </Empty>
      </div>
    {/if}
  </main>
{/if}

<Toasts />
<ConfirmHost />
