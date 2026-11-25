<script lang="ts">
  import { profileOf } from "@app/lib/keyProfiles.svelte";

  import ActorAvatar from "@app/components/ActorAvatar.svelte";

  interface Props {
    // A public key or its DID. Shown as the picture of the profile the key
    // shows as, and as the pattern generated from `nodeId` when it has none.
    nodeId: string;
    styleWidth: string;
  }

  const { nodeId, styleWidth }: Props = $props();
</script>

<ActorAvatar
  actor={profileOf(nodeId) ?? null}
  fallbackId={nodeId}
  {styleWidth} />
