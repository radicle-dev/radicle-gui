<script lang="ts">
  import { untrack } from "svelte";

  import { router } from "@app/lib/router.svelte";
  import { node } from "@app/node/node.svelte";

  import Avatar from "./Avatar.svelte";
  import Icon from "./Icon.svelte";
  import Menu from "./Menu.svelte";
  import NodeChip from "./NodeChip.svelte";
  import Search, { openSearch } from "./Search.svelte";

  const route = $derived(router.route.name);
  const self = $derived(node.person("self"));
  const unread = $derived(node.unreadCount);

  // One background that rests on the current page's item and slides to the
  // hovered one, like the segmented switches.
  let nav: HTMLElement | undefined = $state();
  const items: Record<string, HTMLElement> = $state({});
  let hovered = $state<string | undefined>(undefined);
  let pill = $state({ left: 0, width: 0 });
  // Off while the pill appears from nowhere, so it fades in instead of sliding
  // over from the edge.
  let slide = $state(false);

  const current = $derived(route === "inbox" || route === "explore" ? route : undefined);
  const target = $derived(hovered ?? current);
  const visible = $derived(target !== undefined);

  function measure() {
    const el = target ? items[target] : undefined;
    pill = el ? { left: el.offsetLeft, width: el.offsetWidth } : pill;
  }

  let lastVisible = false;

  // Runs before the DOM updates, so a pill that's appearing jumps into place
  // instead of sliding there.
  $effect.pre(() => {
    void target;
    void unread;
    const wasVisible = lastVisible;
    lastVisible = target !== undefined;
    measure();
    if (!wasVisible) slide = false;
    // Two frames: the jump has to be styled before the transition comes back.
    if (!untrack(() => slide)) requestAnimationFrame(() => requestAnimationFrame(() => (slide = true)));
  });

  // Watches every item, not just the row: a web font loading or a count
  // changing moves items without changing the row's size.
  $effect(() => {
    if (!nav) return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    for (const el of Object.values(items)) if (el) observer.observe(el);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  });
</script>

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: color-mix(in srgb, var(--color-surface-canvas) 92%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--color-border-subtle);
  }
  /* Equal side columns keep the search centred however wide the node chip or
     nav get. */
  .bar {
    max-width: 76rem;
    margin: 0 auto;
    height: 3.5rem;
    padding: 0 1.5rem;
    display: grid;
    /* The sides never shrink below their contents; the search gives way. */
    grid-template-columns: minmax(max-content, 1fr) minmax(10rem, 22rem) minmax(max-content, 1fr);
    align-items: center;
    gap: 1rem;
  }
  .left {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }
  .logo {
    display: inline-flex;
    color: var(--color-text-primary);
  }
  nav {
    position: relative;
    display: flex;
    gap: 0.125rem;
  }
  .pill {
    position: absolute;
    top: 0;
    left: 0;
    height: 2rem;
    border-radius: var(--border-radius-sm);
    background: var(--color-surface-subtle);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .pill.visible {
    opacity: 1;
  }
  .pill.slide {
    transition:
      transform 0.2s ease,
      width 0.2s ease,
      opacity 0.15s ease;
  }
  nav > :global(:not(.pill)) {
    position: relative;
  }
  nav a {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.625rem;
    border-radius: var(--border-radius-sm);
    font: var(--txt-body-m-medium);
    color: var(--color-text-secondary);
    text-decoration: none;
  }
  nav a:hover,
  nav a.active {
    color: var(--color-text-primary);
  }
  .badge {
    font: var(--txt-body-s-semibold);
    background: var(--color-surface-brand-primary);
    color: var(--color-text-on-brand);
    border-radius: var(--border-radius-full);
    padding: 0 0.375rem;
    line-height: 1.125rem;
  }
  .search {
    display: flex;
    justify-content: center;
  }
  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .icon-button {
    all: unset;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    height: 2rem;
    padding: 0 0.375rem;
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-secondary);
  }
  .icon-button:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
  .who {
    padding: 0.375rem 0.5rem;
  }
  .who .alias {
    font: var(--txt-body-m-semibold);
  }
  .who .did {
    font: var(--txt-code-small);
    color: var(--color-text-tertiary);
  }
  @media (max-width: 1000px) {
    nav .label {
      display: none;
    }
  }
  /* Stands in for the search field once it's hidden on narrow screens. */
  .search-icon {
    all: unset;
    cursor: pointer;
    display: none;
    align-items: center;
    height: 2rem;
    padding: 0 0.625rem;
    border-radius: var(--border-radius-sm);
    color: var(--color-text-secondary);
  }
  .search-icon:hover {
    color: var(--color-text-primary);
  }
  .search-icon:focus-visible {
    outline: 2px solid var(--color-border-brand);
  }
  @media (max-width: 760px) {
    .search-icon {
      display: inline-flex;
    }
    .bar {
      grid-template-columns: minmax(max-content, 1fr) auto;
    }
    .search {
      display: none;
    }
  }
  .chevron {
    display: inline-flex;
  }
  /* Phones: tighter spacing and no dropdown chevrons, so everything fits. */
  @media (max-width: 480px) {
    .bar {
      padding: 0 1rem;
      gap: 0.5rem;
    }
    .left {
      gap: 0.5rem;
    }
    .right {
      gap: 0.25rem;
    }
    nav a,
    .search-icon {
      padding: 0 0.5rem;
    }
    .chevron {
      display: none;
    }
  }
  @media (max-width: 360px) {
    .bar {
      padding: 0 0.75rem;
      gap: 0.375rem;
    }
    .left {
      gap: 0.375rem;
    }
    nav a,
    .search-icon {
      padding: 0 0.375rem;
    }
  }
</style>

<header>
  <div class="bar">
    <div class="left">
    <a class="logo" href="/" aria-label="Home">
      <svg width="69" height="16" viewBox="0 0 69 16" fill="currentColor">
        <path
          d="M1.84555 13.7149H0V15.7954H6.28119V13.7149H4.466V7.01257H8.02772V4.61917H1.84555V13.7149Z" />
        <path
          d="M9.20923 12.8172C9.20923 10.7169 10.627 9.62514 13.2475 9.23834L15.1855 8.96243C15.8785 8.86078 16.2152 8.63636 16.2152 8.06474C16.2152 6.98355 15.4706 6.37233 14.1861 6.37233C12.8198 6.37233 12.0964 7.10633 11.8812 8.14659L9.3518 7.76903C9.73992 5.91293 11.2792 4.41458 14.1848 4.41458C17.0904 4.41458 18.8449 6.0159 18.8449 8.56507V15.7941H16.2653V13.7241H16.1637C15.8072 14.9479 14.594 15.9974 12.7485 15.9974C10.5967 15.9974 9.21055 14.7327 9.21055 12.8159L9.20923 12.8172ZM16.2138 10.9109V10.544L13.7874 10.9928C12.5333 11.2278 11.9828 11.7572 11.9828 12.5624C11.9828 13.4601 12.6455 13.9895 13.6554 13.9895C15.369 13.9895 16.2152 12.7459 16.2152 10.9096L16.2138 10.9109Z" />
        <path
          d="M20.5122 10.1861C20.5122 6.65872 22.3274 4.41449 25.0191 4.41449C26.5492 4.41449 27.7518 5.28182 28.3234 6.61647H28.4158V0.826372H31.0469V15.7953H28.4158V13.7465H28.3142C27.6211 15.1841 26.5505 16 25.031 16C22.3287 16 20.5135 13.7267 20.5135 10.1874L20.5122 10.1861ZM25.8455 13.7953C27.4152 13.7953 28.4053 12.3775 28.4053 10.1861C28.4053 7.99469 27.4165 6.58611 25.8455 6.58611C24.2746 6.58611 23.2858 7.99337 23.2858 10.1861C23.2858 12.3788 24.2851 13.7953 25.8455 13.7953Z" />
        <path
          d="M37.3981 13.7149H39.2436V15.7954H32.9624V13.7149H34.7776V6.69967H33.0957V4.61914H37.3981V13.7149ZM34.441 1.54983C34.441 0.693069 35.1551 0 36.0212 0C36.8872 0 37.5816 0.693069 37.5816 1.54983C37.5816 2.4066 36.899 3.08911 36.0212 3.08911C35.1433 3.08911 34.441 2.4066 34.441 1.54983Z" />
        <path
          d="M50.0937 7.98415L47.5644 8.52409C47.299 7.28052 46.5756 6.54653 45.3413 6.54653C43.7505 6.54653 42.7406 7.8825 42.7406 10.2073C42.7406 12.532 43.7598 13.868 45.3505 13.868C46.4924 13.868 47.3083 13.2462 47.5433 12.0026H50.1532C49.8574 14.5109 48.1954 16 45.3505 16C42.0871 16 39.9868 13.7267 39.9868 10.2086C39.9868 6.69042 42.0871 4.41716 45.34 4.41716C48.0317 4.41716 49.765 5.86534 50.0911 7.98547L50.0937 7.98415Z" />
        <path
          d="M55.5287 13.7148H57.3742V15.7953H51.093V13.7148H52.9082V2.90558H51.2264V0.826372H55.5287V13.7148Z" />
        <path
          d="M57.9749 10.2271C57.9749 6.74989 60.1267 4.41458 63.3174 4.41458C66.2442 4.41458 68.5386 6.34197 68.2323 10.808H60.7273C60.8805 12.7855 61.9207 13.938 63.328 13.938C64.5412 13.938 65.3055 13.336 65.6013 12.2958H68.2626C67.9775 14.1822 66.1729 15.9974 63.328 15.9974C60.0963 15.9974 57.9749 13.744 57.9749 10.2258V10.2271ZM65.6013 9.01392C65.5405 7.37167 64.7036 6.38289 63.328 6.38289C62.0739 6.38289 61.0851 7.10633 60.7894 9.01392H65.6026H65.6013Z" />
      </svg>
    </a>
    <nav bind:this={nav} onmouseleave={() => (hovered = undefined)}>
      <span
        class="pill"
        class:visible
        class:slide
        style:width={`${pill.width}px`}
        style:transform={`translateX(${pill.left}px)`}></span>
      <a
        href="/inbox"
        class:active={route === "inbox"}
        bind:this={items.inbox}
        onmouseenter={() => (hovered = "inbox")}
        onfocus={() => (hovered = "inbox")}
        onblur={() => (hovered = undefined)}>
        <Icon name="inbox" /><span class="label">Inbox</span>
        {#if unread > 0}<span class="badge">{unread}</span>{/if}
      </a>
      <a
        href="/explore"
        class:active={route === "explore"}
        bind:this={items.explore}
        onmouseenter={() => (hovered = "explore")}
        onfocus={() => (hovered = "explore")}
        onblur={() => (hovered = undefined)}>
        <Icon name="explore" /><span class="label">Explore</span>
      </a>
      <button
        class="search-icon"
        bind:this={items.search}
        onmouseenter={() => (hovered = "search")}
        onfocus={() => (hovered = "search")}
        onblur={() => (hovered = undefined)}
        onclick={openSearch}
        aria-label="Search the network"
        title="Search the network">
        <Icon name="search" />
      </button>
    </nav>
    </div>
    <div class="search"><Search /></div>
    <div class="right">
      <NodeChip />
      <Menu
        items={[
          { label: "New repository", href: "/new", icon: "repository" },
          { label: "New organization", href: "/orgs/new", icon: "badge" },
        ]}>
        {#snippet trigger(toggle)}
          <button class="icon-button" onclick={toggle} aria-label="Create">
            <Icon name="plus" /><span class="chevron"><Icon name="chevron-down" /></span>
          </button>
        {/snippet}
      </Menu>
      <Menu
        items={[
          { label: "Your profile", href: `/@${self.alias}`, icon: "avatar-incognito" },
          ...node.myOrgs.map(o => ({
            label: o.name,
            href: `/${o.handle}`,
            org: o.id,
          })),
          { label: "Node", href: "/node", icon: "seed", divider: true },
          { label: "Keys & devices", href: "/settings?section=keys", icon: "key" },
          { label: "Settings", href: "/settings", icon: "settings" },
        ]}>
        {#snippet header()}
          <div class="who">
            <div class="alias">{self.alias}</div>
            <div class="did">did:key:{self.nid.slice(0, 10)}…</div>
          </div>
        {/snippet}
        {#snippet trigger(toggle)}
          <button class="icon-button" onclick={toggle} aria-label="Account">
            <Avatar person="self" size="1.5rem" />
          </button>
        {/snippet}
      </Menu>
    </div>
  </div>
</header>
