<script lang="ts" module>
  import type { GitStatusEntry } from "@pierre/trees";

  import { FileTree } from "@pierre/trees";

  // App file glyph (path lifted from Icon.svelte, viewBox 0 0 16 16) exposed as
  // a sprite so the tree uses our file icon instead of Pierre's. Folders are
  // handled separately via CSS masks (see `unsafeCSS` below), because Pierre's
  // folder icon slot holds an expand chevron whose open/closed state is only
  // reachable through the `aria-expanded` attribute in CSS.
  const iconSpriteSheet = `
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display: none">
      <symbol id="app-tree-file" viewBox="0 0 16 16">
        <path fill="currentColor" d="M13.5 14.5L2.5 14.5L2.5 1.5L9.20703 1.5L13.5 5.79297L13.5 14.5ZM8.5 6.5L8.5 2.5L3.5 2.5L3.5 13.5L12.5 13.5L12.5 6.5L8.5 6.5ZM9.5 3.20703L9.5 5.5L11.793 5.5L9.5 3.20703Z" />
      </symbol>
    </svg>
  `;

  // Folder glyphs as CSS mask data URIs (open + closed), swapped by
  // `aria-expanded` on the row. `fill` is irrelevant — masks use alpha only;
  // the visible color comes from `background-color`.
  const folderClosedMask =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M7.20703 2.5L9.20703 4.5H14.5V14.5H1.5V2.5H7.20703ZM2.5 13.5H13.5V5.5H2.5V13.5ZM2.5 4.5H7.79297L6.79297 3.5H2.5V4.5Z'/%3E%3C/svg%3E\")";
  const folderOpenMask =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M7.20703 2.5L9.20703 4.5H14.5V6.5H15.6631L13.377 14.5H1.5V2.5H7.20703ZM2.70898 13.5H12.623L14.3369 7.5H4.85254L2.70898 13.5ZM2.5 11.1133L4.0293 6.83203L4.14746 6.5H13.5V5.5H8.79297L6.79297 3.5H2.5V11.1133Z'/%3E%3C/svg%3E\")";
</script>

<script lang="ts">
  import { theme } from "@app/components/ThemeSwitch.svelte";

  interface Props {
    paths: string[];
    gitStatus?: GitStatusEntry[];
    // Fires only for leaf files; folder selections are ignored.
    onSelect: (path: string) => void;
  }

  const { paths, gitStatus = undefined, onSelect }: Props = $props();

  let container = $state<HTMLElement>();

  $effect(() => {
    const el = container;
    if (!el) {
      return;
    }
    const p = paths;
    const status = gitStatus;
    // The tree renders in a shadow root and picks light/dark via CSS
    // `light-dark()`, which follows `color-scheme`. Its base `:host` hard-sets
    // `light dark` (so it would follow the OS), so force the app's theme via
    // `unsafeCSS` (injected into the winning `@layer unsafe`). Reading `$theme`
    // here also rebuilds the tree when the theme changes.
    const unsafeCSS = `
      :host { color-scheme: ${$theme}; }
      /* Force monochrome file icons: override Pierre's per-file-type colored
         rules (which win on specificity in the base layer) from the highest
         @layer unsafe. */
      [data-item-section="icon"] [data-icon-token] {
        color: var(--trees-fg-muted);
      }
      /* Folders: Pierre puts an expand chevron in the icon slot. Hide it and
         paint a folder glyph in its place via a mask, so the icon keeps its
         natural position and indent. Open/closed follows the row's
         \`aria-expanded\` state. */
      [data-item-type="folder"] > [data-item-section="icon"] > [data-icon-name="file-tree-icon-chevron"] {
        display: none;
      }
      [data-item-type="folder"] > [data-item-section="icon"]::after {
        content: "";
        width: var(--trees-icon-width);
        height: var(--trees-icon-width);
        background-color: var(--trees-fg-muted);
        -webkit-mask: center / contain no-repeat ${folderClosedMask};
        mask: center / contain no-repeat ${folderClosedMask};
      }
      [aria-expanded="true"][data-item-type="folder"] > [data-item-section="icon"]::after {
        -webkit-mask-image: ${folderOpenMask};
        mask-image: ${folderOpenMask};
      }
      /* The directory rollup dot is nudged by \`translateY(.65ex - 50%)\`, an
         x-height offset tuned for system-ui. Our Booton override has a
         different x-height, so it lands too high; the row already flex-centers,
         so drop the nudge and let centering handle it. */
      [data-item-section="git"] [data-icon-name="file-tree-icon-dot"] {
        transform: none;
      }
      /* Flattened folder segments (e.g. ".github / workflows") underline on
         hover by default; the app doesn't underline these, so drop it. */
      [data-item-flattened-subitem]:hover {
        text-decoration: none;
      }
    `;
    // Only the leaf files are selectable targets; folder selections are ignored.
    const files = new Set(p);
    const tree = new FileTree({
      paths: p,
      gitStatus: status,
      initialExpansion: "open",
      flattenEmptyDirectories: true,
      unsafeCSS,
      // `set: "none"` drops Pierre's per-file-type glyphs; files use the app's
      // file glyph via the custom sprite. Folders are handled by the CSS mask
      // in `unsafeCSS` above (the folder icon slot is really an expand chevron).
      icons: {
        set: "none",
        spriteSheet: iconSpriteSheet,
        remap: {
          "file-tree-icon-file": "app-tree-file",
        },
      },
      onSelectionChange: selected => {
        const path = selected.at(-1);
        if (path !== undefined && files.has(path)) {
          onSelect(path);
        }
      },
    });
    tree.render({ containerWrapper: el });
    return () => tree.cleanUp();
  });
</script>

<style>
  .pierre-tree {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    /* Own the inline gap on the host (not a scroll container) so both sides
       are an even 0.5rem. Pierre's own inline padding is zeroed below because
       its `scrollbar-gutter: stable` eats the right padding, leaving the two
       sides uneven. */
    box-sizing: border-box;
    padding: 0 0.5rem;

    /* Match the tree to the app's design tokens. These `--trees-*-override`
       hooks are the top of Pierre's fallback chain (override → theme → default)
       and inherit across the shadow boundary. */
    /* Surfaces & text */
    --trees-bg-override: var(--color-surface-canvas);
    --trees-fg-override: var(--color-text-primary);
    --trees-fg-muted-override: var(--color-text-secondary);
    --trees-bg-muted-override: var(--color-surface-subtle);
    --trees-selected-bg-override: var(--color-surface-mid);
    --trees-selected-fg-override: var(--color-text-primary);
    --trees-border-color-override: var(--color-border-subtle);
    --trees-indent-guide-bg-override: var(--color-border-subtle);
    /* Accent uses our brand (not Pierre's default blue) for any non-border
       accents (e.g. search matches). */
    --trees-accent-override: var(--color-border-brand);
    /* But no blue border around the active/selected row — the app indicates
       selection with a background, not a focus/selection ring. */
    --trees-selected-focused-border-color-override: transparent;
    --trees-focus-ring-color-override: transparent;
    /* Search input */
    --trees-input-bg-override: var(--color-surface-base);
    --trees-search-bg-override: var(--color-surface-base);
    --trees-search-fg-override: var(--color-text-primary);
    /* Git status indicators */
    --trees-git-added-color-override: var(--color-feedback-success-text);
    --trees-git-deleted-color-override: var(--color-feedback-error-text);
    --trees-git-modified-color-override: var(--color-text-brand);
    --trees-git-renamed-color-override: var(--color-feedback-warning-text);
    --trees-git-untracked-color-override: var(--color-feedback-success-text);
    --trees-git-ignored-color-override: var(--color-text-tertiary);
    /* Typography & shape */
    --trees-font-family-override: var(--font-family-ui);
    --trees-font-size-override: 0.875rem;
    --trees-border-radius-override: var(--border-radius-sm);
    /* Inline gap is handled by the host's padding (above); zero Pierre's own so
       the two aren't added together and the right side isn't eaten by its
       scrollbar gutter. */
    --trees-padding-inline-override: 0;
  }
</style>

<div bind:this={container} class="pierre-tree"></div>
