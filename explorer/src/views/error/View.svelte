<script lang="ts">
  import type { BaseUrl } from "@http-client";
  import type { ComponentProps } from "svelte";
  import type IconLarge from "@app/components/IconLarge.svelte";
  import type { ErrorParam } from "@app/lib/router/definitions";

  import { baseUrlToString } from "@app/lib/utils";
  import Layout from "@app/App/Layout.svelte";
  import ErrorMessage from "@app/components/ErrorMessage.svelte";

  export let icon: ComponentProps<IconLarge>["name"] = "desert";
  export let title: string;
  export let description: string;
  export let error: ErrorParam = undefined;
  export let baseUrl: BaseUrl | undefined = undefined;
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
        seed={baseUrl ? baseUrlToString(baseUrl) : undefined} />
    </div>
  </div>
</Layout>
