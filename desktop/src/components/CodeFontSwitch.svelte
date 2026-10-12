<script lang="ts" module>
  import { writable } from "svelte/store";

  type CodeFont = "jetbrains" | "system";

  export const codeFont = writable<CodeFont>(loadCodeFont());

  function loadCodeFont(): CodeFont {
    const stored = localStorage ? localStorage.getItem("codefont") : null;
    return stored === "system" ? "system" : "jetbrains";
  }

  export function storeCodeFont(font: CodeFont): void {
    codeFont.set(font);
    if (localStorage) {
      localStorage.setItem("codefont", font);
    }
  }
</script>

<script lang="ts">
  import Button from "@app/components/Button.svelte";
</script>

<style>
  .container {
    display: flex;
    align-items: center;
  }
</style>

<div class="container">
  <Button
    variant="ghost"
    flatRight
    active={$codeFont === "jetbrains"}
    onclick={() => storeCodeFont("jetbrains")}>
    JetBrains Mono
  </Button>

  <Button
    variant="ghost"
    flatLeft
    active={$codeFont === "system"}
    onclick={() => storeCodeFont("system")}>
    System
  </Button>
</div>
