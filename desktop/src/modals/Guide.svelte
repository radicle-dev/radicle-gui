<script lang="ts">
  import { radicleInstalled } from "@app/lib/checkRadicleCLI.svelte";
  import { nodeRunning } from "@app/lib/events";
  import { show } from "@app/lib/modal";
  import type { SidebarData } from "@app/lib/router/definitions";
  import { sleep } from "@app/lib/sleep";
  import { didFromPublicKey, truncateDid } from "@app/lib/utils";

  import { addRepoPopoverToggleId } from "@app/components/AddRepoButton.svelte";
  import Command from "@app/components/Command.svelte";
  import CopyableId from "@app/components/CopyableId.svelte";
  import Icon from "@app/components/Icon.svelte";
  import NodeId from "@app/components/NodeId.svelte";
  import SettingsView from "@app/modals/Settings.svelte";
  import Layout from "@app/views/repo/Layout.svelte";

  interface Props {
    sidebarData: SidebarData;
  }

  const { sidebarData }: Props = $props();

  const config = $derived(sidebarData.config);
</script>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .hero {
    width: 100%;
    flex-shrink: 0;
    overflow: hidden;
    max-height: 18rem;
  }
  .hero img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 77%;
    display: block;
    -webkit-user-drag: none;
    user-select: none;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    display: grid;
    place-items: center;
  }
  .inner {
    width: 100%;
    max-width: 48rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    width: min(100%, 48rem);
    margin-bottom: 3rem;
  }
  .heading {
    font: var(--txt-heading-l);
    color: var(--color-text-primary);
    margin-bottom: 0.25rem;
  }
  .body {
    font: var(--txt-body-l-regular);
    color: var(--color-text-primary);
  }
  button {
    text-decoration: underline;
    border: 0;
    color: var(--color-text-primary);
    margin: 0;
    padding: 0;
    background-color: transparent;
    cursor: pointer;
    font: var(--txt-body-l-regular);
  }
</style>

<Layout>
  <div class="page">
    <div class="hero">
      <img src="/flower.png" alt="" />
    </div>
    <div class="content">
      <div class="inner">
        <div class="heading">Getting started</div>

        <div class="body">
          Hello <NodeId
            inline
            styleFont="var(--txt-body-l-regular)"
            publicKey={config.publicKey}
            alias={config.alias} />, your identity has been created and stored
          on your machine.
        </div>
        <div class="body">
          Your public key is <CopyableId
            inline
            styleFont="var(--txt-body-l-regular)"
            id={didFromPublicKey(config.publicKey)}>
            {truncateDid(config.publicKey)}
          </CopyableId>
          you can share this with anyone to find you on the network.
        </div>
        <div class="body">
          We release a new version of the app every two weeks. To stay up to
          date, go to
          <button onclick={() => show({ component: SettingsView, props: {} })}>
            Settings
          </button>
          and enable 'Notify on new versions' to receive notifications about new releases.
        </div>

        {#if !radicleInstalled() && !$nodeRunning}
          <div class="body">
            <div class="global-flex" style:padding-bottom="1rem">
              <Icon name="warning" />Radicle CLI is not installed
            </div>
            <div style:padding-bottom="1rem">
              To interact with repos on the Radicle network, you'll need to
              install Radicle node along with its accompanying CLI tools. The
              node runs in the background, enabling seamless pushing and pulling
              of changes, while the CLI tools let you manage the node and
              provide interoperability between Git and Radicle.
            </div>
            <div style:padding-bottom="0.5rem">
              To install Radicle node and CLI tooling, run this in your shell:
            </div>
            <Command
              styleWidth="fit-content"
              command="curl -sSf https://radicle.dev/install | sh" />
          </div>
        {/if}

        <div class="body">
          <!-- prettier-ignore -->
          To get started,

          <button
            onclick={async () => {
              await sleep(1);
              document.getElementById(addRepoPopoverToggleId)?.click();
            }}>
            try adding a repo!
          </button>
        </div>
      </div>
    </div>
  </div>
</Layout>
