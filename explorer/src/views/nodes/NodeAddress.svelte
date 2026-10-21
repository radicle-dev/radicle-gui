<script lang="ts">
  import type { Node } from "@http-client";

  import { truncateId } from "@app/lib/utils";
  import Id from "@app/components/Id.svelte";

  export let node: Node;

  $: clipboard = node.config?.externalAddresses
    ? `${node.id}@${node.config.externalAddresses[0]}`
    : node.id;
</script>

<div style:word-break="break-word">
  <!--prettier-ignore-->
  <Id ariaLabel="node-id" shorten={false} id={clipboard}>
    {#if node.config?.externalAddresses.length}
      {truncateId(node.id)}@<wbr />{node.config?.externalAddresses[0]}
    {:else}
      {truncateId(node.id)}
    {/if}
  </Id>
</div>
