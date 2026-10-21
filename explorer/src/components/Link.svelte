<script lang="ts">
  import type { Route } from "@app/lib/router/definitions";

  import { createEventDispatcher } from "svelte";
  import { push, routeToPath, useDefaultNavigation } from "@app/lib/router";

  export let route: Route;
  export let disabled: boolean = false;
  export let styleHoverState: boolean = false;
  export let styleTextOverflow: boolean = false;
  export let title: string | undefined = undefined;
  export let ariaLabel: string | undefined = undefined;
  export let style: string | undefined = undefined;

  const dispatch = createEventDispatcher<{
    afterNavigate: null;
  }>();

  function navigateToRoute(event: MouseEvent): void {
    if (disabled) {
      event.preventDefault();
      return;
    }

    if (useDefaultNavigation(event)) {
      return;
    }

    event.preventDefault();
    void push(route);
    dispatch("afterNavigate");
  }
</script>

<style>
  .hover-style:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }
</style>

<a
  class:txt-overflow={styleTextOverflow}
  class:hover-style={styleHoverState}
  on:click={navigateToRoute}
  href={routeToPath(route)}
  aria-label={ariaLabel}
  {title}
  {style}>
  <slot />
</a>
