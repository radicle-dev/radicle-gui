<script lang="ts">
  import { cachedUserAvatar } from "@app/lib/avatar";

  interface Props {
    nodeId: string;
    styleWidth: string;
  }

  const { nodeId, styleWidth }: Props = $props();

  let dataUri: string | undefined = $state(undefined);

  $effect(() => {
    void cachedUserAvatar(nodeId.replace("did:key:", "")).then(data => {
      dataUri = data;
    });
  });
</script>

{#if dataUri}
  <img
    style:width={styleWidth}
    style:height={styleWidth}
    src={dataUri}
    alt="Avatar" />
{/if}
