<script lang="ts">
  import IconLarge from "@app/components/IconLarge.svelte";
  import Icon from "@app/components/Icon.svelte";
  import KeyHint from "@app/components/KeyHint.svelte";
  import Modal from "@app/components/Modal.svelte";

  // Show the platform's search modifier: ⌘ on macOS, Ctrl elsewhere. The
  // handler itself accepts either (`metaKey || ctrlKey`), this only labels it.
  const searchModifier =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent)
      ? "⌘"
      : "Ctrl";
</script>

<style>
  .hotkeys {
    justify-content: center;
    gap: 1rem;
    display: flex;
    flex-direction: column;
    font: var(--txt-body-l-regular);
  }

  .pair {
    display: flex;
    width: 24rem;
    justify-content: space-between;
  }
  .keys {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>

<Modal title="Keyboard shortcuts">
  <IconLarge name="keyboard" slot="icon" />

  <div slot="body">
    <div class="hotkeys">
      <div class="pair">
        <span>Search</span>
        <div class="keys">
          <KeyHint>{searchModifier}</KeyHint>
          +
          <KeyHint>K</KeyHint>
        </div>
      </div>

      <div class="pair">
        <span>Submit</span>
        <KeyHint>⏎</KeyHint>
      </div>

      <div class="pair">
        <span>Select multiple lines</span>
        <div class="keys">
          <KeyHint>Shift</KeyHint>
          +
          <Icon name="cursor" />
        </div>
      </div>
      <div class="pair">
        <span>Close</span>
        <KeyHint>Esc</KeyHint>
      </div>
    </div>
  </div>
</Modal>
