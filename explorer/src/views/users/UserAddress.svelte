<script lang="ts">
  import { formatDid, formatNodeId } from "@app/lib/utils";

  import Id from "@app/components/Id.svelte";

  export let did: { prefix: string; pubkey: string };
</script>

<div style:word-break="break-word">
  <Id styleWidth="fit-content" ariaLabel="node-id" id={formatDid(did)}>
    <div class="txt-overflow">
      {formatNodeId(did.pubkey)}
    </div>
  </Id>
</div>
