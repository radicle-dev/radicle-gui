<script lang="ts">
  import type { BaseUrl } from "@http-client";
  import type { ComponentProps } from "svelte";
  import type IconLarge from "@app/components/IconLarge.svelte";
  import type { ErrorParam } from "@app/lib/router/definitions";

  import isEqual from "lodash/isEqual";

  import {
    activeUnloadedRouteStore,
    replace,
    routeBaseUrl,
    withBaseUrl,
  } from "@app/lib/router";
  import { baseUrlToString } from "@app/lib/utils";
  import { determineSeed } from "@app/views/nodes/SeedSelector";

  import Button from "@app/components/Button.svelte";
  import ErrorMessage from "@app/components/ErrorMessage.svelte";
  import Layout from "@app/App/Layout.svelte";
  import Link from "@app/components/Link.svelte";

  export let icon: ComponentProps<IconLarge>["name"] = "desert";
  export let title: string;
  export let description: string;
  export let error: ErrorParam = undefined;
  export let baseUrl: BaseUrl | undefined = undefined;

  let retrying = false;

  $: failedRoute = $activeUnloadedRouteStore;
  $: canRetry =
    baseUrl !== undefined && routeBaseUrl(failedRoute) !== undefined;
  const defaultSeed = determineSeed();
  $: fallbackRoute =
    canRetry && !isEqual(defaultSeed, baseUrl)
      ? withBaseUrl(failedRoute, defaultSeed)
      : undefined;

  async function retry() {
    retrying = true;
    try {
      await replace(failedRoute);
    } finally {
      retrying = false;
    }
  }
</script>

<style>
  .wrapper {
    padding: 4rem 0 2rem 0;
    gap: 1.5rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }

  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    max-width: 100%;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
</style>

<Layout>
  <div class="wrapper">
    <div class="container">
      <ErrorMessage
        {icon}
        {title}
        {description}
        {error}
        seed={baseUrl ? baseUrlToString(baseUrl) : undefined}>
        {#if canRetry}
          <div class="actions">
            <Button variant="outline" disabled={retrying} on:click={retry}>
              {retrying ? "Retrying…" : "Try again"}
            </Button>
            {#if fallbackRoute}
              <Link route={fallbackRoute}>
                <Button variant="foreground">
                  Go to {defaultSeed.hostname}
                </Button>
              </Link>
            {/if}
          </div>
        {/if}
      </ErrorMessage>
    </div>
  </div>
</Layout>
