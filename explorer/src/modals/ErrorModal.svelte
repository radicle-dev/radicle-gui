<script lang="ts">
  import config from "@app/lib/config";

  import Command from "@app/components/Command.svelte";
  import ExternalLink from "@app/components/ExternalLink.svelte";
  import IconLarge from "@app/components/IconLarge.svelte";
  import Modal from "@app/components/Modal.svelte";

  export let title: string;
  export let subtitle: string[];
  // This is more explicit than the standard error type.
  export let error: { message: string; stack?: string };
</script>

<Modal {title}>
  <IconLarge name="alert" slot="icon" />

  <div slot="subtitle">
    {#each subtitle as line, i}
      {#if i > 0}<br />{/if}{line}
    {/each}

    <br />
    <br />
    If you need help resolving this issue, copy the error message
    <br />
    below and send it to us on
    <ExternalLink href={config.supportWebsite}>
      {config.supportWebsite}
    </ExternalLink>
  </div>

  <div slot="body">
    <div style:max-width="28rem">
      <Command command={JSON.stringify(error)} fullWidth showPrompt={false} />
    </div>
  </div>
</Modal>
