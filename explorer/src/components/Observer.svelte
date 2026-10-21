<script lang="ts" context="module">
  export function intersection(
    node: HTMLElement,
    observer: IntersectionObserver | undefined,
  ) {
    if (!observer) return;
    observer.observe(node);
    return {
      destroy() {
        observer.unobserve(node);
      },
    };
  }
</script>

<script lang="ts">
  import { onDestroy } from "svelte";

  let observer: IntersectionObserver | undefined = undefined;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  let filesVisibility = new Set<string>();

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          filesVisibility = filesVisibility.add(
            entry.target.id.replace("observer:", ""),
          );
        }
      });
    });
  }

  onDestroy(() => {
    if (observer) {
      observer.disconnect();
    }
  });
</script>

<slot {observer} {filesVisibility} />
