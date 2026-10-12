<script lang="ts">
  import type { Config } from "@bindings/config/Config";

  import { cachedConfig, cachedRepoById } from "@app/lib/invoke";
  import { describeLink, referenceRoute } from "@app/lib/mentions";
  import { formatReference, parseReference } from "@app/lib/radUri";
  import { push, routeToPath } from "@app/lib/router";
  import { fetchingRepos } from "@app/lib/seedRepo";
  import { explorerLink } from "@app/lib/utils";

  import ExplorerMenu, {
    keepSelection,
    type MenuPosition,
    menuPosition,
  } from "@app/components/ExplorerMenu.svelte";
  import Icon from "@app/components/Icon.svelte";

  interface Props {
    href: string;
    label: string;
  }

  const { href, label }: Props = $props();

  const reference = $derived(parseReference(href));
  const icon = $derived(reference && describeLink(reference, "")?.icon);
  let config: Config | undefined = $state(undefined);
  const url = $derived(
    reference && config ? explorerLink(reference, config) : undefined,
  );

  $effect(() => {
    if (!reference || config) return;
    let cancelled = false;
    void cachedConfig()
      .then(result => {
        if (!cancelled) config = result;
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  });

  const route = $derived(reference && referenceRoute(reference));
  const rid = $derived(
    reference?.type === "uri" ? `rad:${reference.uri.repo}` : undefined,
  );
  const fetching = $derived(rid !== undefined && $fetchingRepos.includes(rid));
  let local: boolean | undefined = $state(undefined);
  $effect(() => {
    if (!rid || fetching) return;
    let cancelled = false;
    void cachedRepoById(rid)
      .then(repo => {
        if (!cancelled) local = repo !== null;
      })
      .catch(() => {
        if (!cancelled) local = false;
      });
    return () => {
      cancelled = true;
    };
  });
  const inApp = $derived(local === true && route !== undefined);
  const linkHref = $derived(inApp && route ? routeToPath(route) : url);
  const seedRid = $derived(local === false && !fetching ? rid : undefined);

  function handleClick(event: MouseEvent) {
    if (!inApp || !route) return;
    event.preventDefault();
    void push(route);
  }

  let menu: MenuPosition | undefined = $state(undefined);

  function openMenu(event: MouseEvent) {
    if (url || seedRid) menu = menuPosition(event);
  }
</script>

<style>
  .icon {
    display: inline-flex;
    vertical-align: middle;
    margin-right: 0.25rem;
    color: var(--color-text-tertiary);
  }
</style>

<a
  href={linkHref}
  target={!inApp && url ? "_blank" : undefined}
  rel={!inApp && url ? "noopener noreferrer" : undefined}
  title={href}
  onclick={handleClick}
  onmousedown={keepSelection}
  oncontextmenu={openMenu}>
  {#if icon}
    <span class="icon"><Icon name={icon} /></span>
  {/if}{label}
</a>

{#if menu && config}
  <ExplorerMenu
    x={menu.x}
    y={menu.y}
    target={menu.target}
    {url}
    uri={reference ? formatReference(reference) : href}
    {seedRid}
    {config}
    onclose={() => (menu = undefined)} />
{/if}
