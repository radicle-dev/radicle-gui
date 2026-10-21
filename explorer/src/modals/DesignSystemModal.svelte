<script lang="ts">
  import { followSystemTheme, theme } from "@app/lib/appearance";

  import Button from "@app/components/Button.svelte";
  import Icon from "@app/components/Icon.svelte";
  import Modal from "@app/components/Modal.svelte";
  import Radio from "@app/components/Radio.svelte";

  function extractCssVariables(variableName: string) {
    return Array.from(document.styleSheets)
      .filter(
        sheet =>
          sheet.href === null || sheet.href.startsWith(window.location.origin),
      )
      .reduce<string[]>(
        (acc, sheet) => [
          ...acc,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          ...Array.from(sheet.cssRules).reduce(
            (def, rule) =>
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              rule.selectorText === ":root"
                ? [
                    ...def,
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    ...Array.from(rule.style).filter(name =>
                      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                      // @ts-ignore
                      name.startsWith(variableName),
                    ),
                  ]
                : def,
            [],
          ),
        ],
        [],
      );
  }

  // rg "\--color-\w*-\w*" -o --no-line-number --no-filename -g "\!public/colors.css" -g "\!DesignSystemModal.svelte" | sort | uniq | jq -sRM 'split("\n")[:-1]'
  const usedColors = [
    "--color-border-alpha",
    "--color-border-brand",
    "--color-border-mid",
    "--color-border-subtle",
    "--color-brand-bg",
    "--color-feedback-error",
    "--color-feedback-success",
    "--color-feedback-warning",
    "--color-prettylights-syntax",
    "--color-surface-alpha",
    "--color-surface-archived",
    "--color-surface-base",
    "--color-surface-brand",
    "--color-surface-canvas",
    "--color-surface-draft",
    "--color-surface-merged",
    "--color-surface-mid",
    "--color-surface-open",
    "--color-surface-strong",
    "--color-surface-subtle",
    "--color-text-archived",
    "--color-text-brand",
    "--color-text-disabled",
    "--color-text-draft",
    "--color-text-merged",
    "--color-text-on",
    "--color-text-open",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-text-tertiary",
  ];

  const colors = extractCssVariables("--color").filter(c => {
    return (
      !c.startsWith("--color-prettylights-syntax") &&
      !c.startsWith("--color-accent") &&
      !c.startsWith("--color-semantic") &&
      !c.startsWith("--color-neutrals")
    );
  });

  function getColorGroup(color: string): string {
    // For simpler tokens like "--color-surface-base", just get the first part
    // e.g., "--color-surface-base" -> "surface"
    const simpleMatch = color.match(/--color-([a-z]+)-/);
    if (simpleMatch) {
      return simpleMatch[1];
    }

    return "";
  }

  const colorGroups = [...new Set(colors.map(getColorGroup))].filter(
    g => g !== "",
  );

  let checkers = $state(false);

  const icons = [
    "activity",
    "add-emoji",
    "archive",
    "arrow-down",
    "arrow-left",
    "arrow-right",
    "arrow-up",
    "attach",
    "avatar-incognito",
    "badge",
    "bell",
    "binary",
    "bookmark",
    "bookmark-filled",
    "branch",
    "checkmark",
    "checkout",
    "chevron-down",
    "chevron-left",
    "chevron-left-right",
    "chevron-right",
    "chevron-up",
    "chevron-up-down",
    "clear-all",
    "clipboard",
    "clock",
    "close",
    "code",
    "collapse-in",
    "collapse-vertical",
    "comment",
    "comment-checkmark",
    "comment-cross",
    "commit",
    "copy",
    "cursor",
    "dashboard",
    "device",
    "diff",
    "disconnect",
    "document",
    "download",
    "edit",
    "ellipsis",
    "ellipsis-vertical",
    "emoji",
    "expand-out",
    "expand-vertical",
    "explore",
    "eye",
    "eye-slash",
    "filter",
    "folder",
    "folder-open",
    "fullscreen",
    "git",
    "guide",
    "help",
    "home",
    "hourglass",
    "inbox",
    "issue",
    "issue-closed",
    "key",
    "label",
    "lightbulb",
    "link",
    "lock",
    "logo",
    "mark-read",
    "markdown",
    "menu",
    "minus",
    "moon",
    "none",
    "offline",
    "online",
    "open-external",
    "patch",
    "patch-archived",
    "patch-draft",
    "patch-merged",
    "pin-filled",
    "pin-hollow",
    "placeholder",
    "play",
    "plus",
    "question-mark",
    "reply",
    "repository",
    "revision",
    "sad-emoji",
    "search",
    "seed",
    "seed-filled",
    "settings",
    "share",
    "sidebar-left",
    "sidebar-left-filled",
    "sidebar-right",
    "sidebar-right-filled",
    "stop",
    "sun",
    "thumbs-up",
    "trash",
    "warning",
    "webhooks",
  ] as const;
</script>

<style>
  .checkers {
    background: repeating-conic-gradient(#88888833 0% 25%, transparent 0% 50%)
      50% / 20px 20px;
    border-radius: 1rem;
  }

  .container {
    display: flex;
    margin: 0;
    padding: 0;
  }

  .color {
    width: 3rem;
    height: 3rem;
    border-radius: var(--border-radius-md);
    outline-style: solid !important;
    outline-color: #88888899 !important;
    outline-offset: 0.3rem;
    margin: 1rem;
  }

  .unused {
    outline-style: dotted !important;
    outline-color: #55555555 !important;
  }
</style>

<Modal>
  <div slot="body" style="display: flex; flex-direction: column;">
    <div
      style="display: flex; margin-left: auto; width: 100%; padding-left: 0.5rem; margin-bottom: 1rem; gap: 0.5rem;">
      <Button
        ariaLabel="transparency"
        styleBorderRadius="0"
        variant={checkers ? "selected" : "not-selected"}
        on:click={() => {
          checkers = !checkers;
        }}>
        {#if checkers}
          <Icon name="eye" />
        {:else}
          <Icon name="eye-slash" />
        {/if}
      </Button>
      <Radio>
        <Button
          ariaLabel="Light Mode"
          styleBorderRadius="0"
          variant={!$followSystemTheme && $theme === "light"
            ? "selected"
            : "not-selected"}
          on:click={() => {
            theme.set("light");
            followSystemTheme.set(false);
          }}>
          <Icon name="sun" />
        </Button>
        <div class="global-spacer"></div>
        <Button
          ariaLabel="Dark Mode"
          styleBorderRadius="0"
          variant={!$followSystemTheme && $theme === "dark"
            ? "selected"
            : "not-selected"}
          on:click={() => {
            theme.set("dark");
            followSystemTheme.set(false);
          }}>
          <Icon name="moon" />
        </Button>
      </Radio>
    </div>

    <div class="container">
      <div class:checkers>
        {#each colorGroups as colorGroup}
          <div style:display="flex">
            {#each colors.filter(color => {
              return getColorGroup(color) === colorGroup;
            }) as color}
              <div style:display="inline-flex">
                <div
                  class:unused={!usedColors.includes(color)}
                  title={color}
                  class="color"
                  style:background-color={`var(${color})`}>
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>

    <div
      style="display: flex; flex-direction: column; padding-left: 0.5rem; width: 100%; align-items: flex-start;">
      <div style="margin-top: 1rem; display: flex; flex-direction: row;">
        {#each icons.slice(0, 25) as icon}
          <div style="display: flex;" title={icon}>
            <Icon name={icon} />
          </div>
        {/each}
      </div>
      <div style="margin-top: 1rem; display: flex; flex-direction: row;">
        {#each icons.slice(25, 50) as icon}
          <div style="display: flex;" title={icon}>
            <Icon name={icon} />
          </div>
        {/each}
      </div>
      <div style="margin-top: 1rem; display: flex; flex-direction: row;">
        {#each icons.slice(50, 75) as icon}
          <div style="display: flex;" title={icon}>
            <Icon name={icon} />
          </div>
        {/each}
      </div>
      <div style="margin-top: 1rem; display: flex; flex-direction: row;">
        {#each icons.slice(75, 100) as icon}
          <div style="display: flex;" title={icon}>
            <Icon name={icon} />
          </div>
        {/each}
      </div>
      <div style="margin-top: 1rem; display: flex; flex-direction: row;">
        {#each icons.slice(100) as icon}
          <div style="display: flex;" title={icon}>
            <Icon name={icon} />
          </div>
        {/each}
      </div>
    </div>
  </div>
</Modal>
