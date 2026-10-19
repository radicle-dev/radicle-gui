<script lang="ts">
  import { cachedRepoAvatar } from "@app/lib/avatar";

  interface Props {
    name: string;
    rid: string;
    styleWidth: string;
  }

  const { name, rid, styleWidth }: Props = $props();

  let dataUri: string | undefined = $state(undefined);

  $effect(() => {
    // We strip out characters from the RID that repeat for all RIDs this leads
    // to the generated avatars looking nicer visually.
    const key = `${name}${rid.replace("rad:z", "")}${name}`;

    void cachedRepoAvatar(key).then((data: string) => {
      dataUri = data;
    });
  });
</script>

{#if dataUri}
  <img
    style:width={styleWidth}
    style:height={styleWidth}
    src={dataUri}
    alt="Repository Avatar" />
{:else}
  <div
    style:width={styleWidth}
    style:height={styleWidth}
    style:background-color="var(--color-surface-subtle)">
  </div>
{/if}
