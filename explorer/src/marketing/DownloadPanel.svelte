<script lang="ts">
  import type { Os } from "@app/marketing/PlatformIcon.svelte";

  import CopyCommand from "@app/marketing/CopyCommand.svelte";
  import PlatformIcon from "@app/marketing/PlatformIcon.svelte";

  let openItem = 0;

  const downloads: {
    name: string;
    os: Os;
    description: string;
    command: string;
  }[] = [
    {
      name: "Apple Silicon",
      os: "macos",
      description:
        "Run the command in your terminal to download and open the DMG file. Then drag the Radicle app to your Applications folder.",
      command:
        "curl --output ~/Downloads/radicle-desktop-aarch64.dmg https://files.radicle.dev/releases/radicle-desktop/latest/radicle-desktop-aarch64.dmg && open ~/Downloads/radicle-desktop-aarch64.dmg",
    },
    {
      name: "Linux AppImage",
      os: "linux",
      description:
        "Download, make the file executable with chmod +x, and run it.",
      command:
        "curl --output radicle-desktop-amd64.AppImage https://files.radicle.dev/releases/radicle-desktop/latest/radicle-desktop-amd64.AppImage",
    },
    {
      name: "Debian / Ubuntu",
      os: "linux",
      description: "Install the keyring, add the APT repository, then install.",
      command:
        'curl -LO https://radicle.dev/apt/radicle-archive-keyring.deb && chmod a+r radicle-archive-keyring.deb && sudo apt install ./radicle-archive-keyring.deb && echo "deb [signed-by=/usr/share/radicle/radicle-archive-keyring.asc] https://radicle.dev/apt release main" | sudo tee /etc/apt/sources.list.d/radicle.list && sudo apt update && sudo apt install radicle-desktop',
    },
    {
      name: "Arch Linux",
      os: "linux",
      description: "Available in the official extra repository.",
      command: "pacman -Syu radicle-desktop",
    },
    {
      name: "NixOS",
      os: "linux",
      description:
        "Try it with nix run, then make it permanent with nix profile install. radicle-desktop is available in Nixpkgs.",
      command: "nix run nixpkgs#radicle-desktop",
    },
    {
      name: "Windows WSL2",
      os: "windows",
      description:
        "Use WSL2 with any of the Linux install options to run Radicle Desktop on Windows.",
      command: "",
    },
  ];

  function toggleItem(index: number) {
    openItem = openItem === index ? -1 : index;
  }
</script>

<style>
  .download-panel {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 1.5rem;
    padding-right: 1.5rem;
    overflow: hidden;
  }

  .download-left {
    width: 20rem;
    flex-shrink: 0;
    padding: 1.25rem 1.5rem 1.25rem 0;
  }

  .download-left h3 {
    padding: 0;
  }

  .download-right {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;
  }

  .download-divider {
    height: 1px;
    background: var(--color-border-subtle);
  }

  .download-item {
    border-radius: 0.125rem;
    min-width: 0;
  }

  .download-question {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 0;
    gap: 2rem;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-primary);
    text-align: left;
  }

  .download-question:hover {
    color: var(--color-brand-hover);
  }

  .download-name {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
  }

  .chevron {
    flex: none;
    color: var(--color-text-tertiary);
    transition: transform 0.2s ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .download-answer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-bottom: 2.5rem;
    min-width: 0;
  }

  .download-description {
    color: var(--color-text-tertiary);
    max-width: 45rem;
    margin: 0;
  }

  @media (max-width: 64rem) {
    .download-panel {
      flex-direction: column;
      padding-right: 0;
    }

    .download-left {
      width: 100%;
      padding-right: 0;
      padding-bottom: 0;
    }
  }
</style>

<section class="download-panel">
  <div class="download-left">
    <h3 class="txt-bold-22">Select your OS and follow the instructions</h3>
  </div>
  <div class="download-right">
    {#each downloads as dl, i}
      {#if i > 0}
        <div class="download-divider"></div>
      {/if}
      <div class="download-item">
        <button class="download-question" on:click={() => toggleItem(i)}>
          <span class="download-name txt-bold-18">
            <PlatformIcon os={dl.os} size="1.25rem" />
            {dl.name}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            class="chevron"
            class:open={openItem === i}>
            <path
              d="M4 10L8 6L12 10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        </button>
        {#if openItem === i}
          <div class="download-answer">
            <p class="txt-medium-16 download-description">{dl.description}</p>
            {#if dl.command}
              <CopyCommand command={dl.command} />
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>
