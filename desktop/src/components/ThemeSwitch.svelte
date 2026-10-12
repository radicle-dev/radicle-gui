<script lang="ts" module>
  import { writable } from "svelte/store";

  type Theme = "dark" | "light";

  export function loadTheme(): Theme {
    const { matches } = window.matchMedia("(prefers-color-scheme: dark)");
    return matches ? "dark" : "light";
  }

  function initTheme(): Theme {
    const storedTheme = localStorage ? localStorage.getItem("theme") : null;
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }
    return loadTheme();
  }

  export const followSystemTheme = writable<boolean>(
    typeof localStorage !== "undefined"
      ? !localStorage.getItem("theme")
      : false,
  );

  export const theme = writable<Theme>(initTheme());

  export function storeTheme(newTheme: Theme): void {
    followSystemTheme.set(false);
    theme.set(newTheme);
    if (localStorage) {
      localStorage.setItem("theme", newTheme);
    }
  }

  export function setSystemTheme(): void {
    followSystemTheme.set(true);
    theme.set(loadTheme());
    if (localStorage) {
      localStorage.removeItem("theme");
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
    active={$followSystemTheme}
    onclick={setSystemTheme}>
    System
  </Button>
  <Button
    variant="ghost"
    flatLeft
    flatRight
    active={!$followSystemTheme && $theme === "light"}
    onclick={() => storeTheme("light")}>
    Light
  </Button>
  <Button
    variant="ghost"
    flatLeft
    active={!$followSystemTheme && $theme === "dark"}
    onclick={() => storeTheme("dark")}>
    Dark
  </Button>
</div>
