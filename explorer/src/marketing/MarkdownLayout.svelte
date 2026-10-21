<script lang="ts">
  import { handleDelegatedLinkClick } from "@app/marketing/link";

  function addCopyButtons(node: HTMLElement) {
    const pres = node.querySelectorAll("pre");

    for (const pre of pres) {
      pre.style.position = "relative";

      const btn = document.createElement("button");
      btn.className = "copy-code-button";
      btn.setAttribute("aria-label", "Copy to clipboard");

      const img = document.createElement("img");
      img.src = "/icons/copy.svg";
      img.alt = "Copy";
      img.width = 16;
      img.height = 16;
      btn.appendChild(img);

      let timeout: ReturnType<typeof setTimeout> | undefined;
      btn.addEventListener("click", async () => {
        const code = pre.querySelector("code");
        const text = code ? code.innerText : pre.innerText;
        try {
          await navigator.clipboard.writeText(text);
          img.src = "/icons/check.svg";
          img.alt = "Copied";
          btn.setAttribute("aria-label", "Copied to clipboard");
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            img.src = "/icons/copy.svg";
            img.alt = "Copy";
            btn.setAttribute("aria-label", "Copy to clipboard");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
        }
      });

      pre.appendChild(btn);
    }
  }
</script>

<!-- Delegated link handling: keyboard users still activate the anchors
     directly, which dispatches the click this handler relies on. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
<main
  class="page-container markdown-content"
  use:addCopyButtons
  on:click={handleDelegatedLinkClick}>
  <slot />
</main>
