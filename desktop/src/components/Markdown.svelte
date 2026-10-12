<script lang="ts" module>
  const alertIcons = {
    note: "guide",
    tip: "lightbulb",
    important: "comment",
    warning: "warning",
    caution: "stop",
  } as const;
</script>

<script lang="ts">
  import { mount, tick, unmount } from "svelte";

  import { enhanceCodeBlocks } from "@app/lib/codeBlocks";
  import type { OpenFile } from "@app/lib/documentLinks";
  import {
    enhanceDocumentLink,
    scrollToLocationFragment,
  } from "@app/lib/documentLinks";
  import { decodeEmbed, embedPreviewKind, retinaWidth } from "@app/lib/embeds";
  import { parseFrontmatter } from "@app/lib/frontmatter";
  import { invoke } from "@app/lib/invoke";
  import {
    alertVariants,
    isTaskCheckbox,
    maximumReferences,
    renderMarkdown,
    toggleTask,
  } from "@app/lib/markdown";
  import { parseEntityHref } from "@app/lib/mentions";
  import { renderMermaidBlocks } from "@app/lib/mermaid";
  import { isOid } from "@app/lib/radUri";
  import { enhanceRepoImages, RepoImages } from "@app/lib/repoImages";
  import * as router from "@app/lib/router";
  import { twemoji } from "@app/lib/utils";

  import Icon from "@app/components/Icon.svelte";
  import Mention from "@app/components/Mention.svelte";
  import ReferenceLink from "@app/components/ReferenceLink.svelte";
  import { theme } from "@app/components/ThemeSwitch.svelte";

  interface Props {
    rid?: string;
    content: string;
    // Path of the document being rendered, used to resolve relative links to
    // other files in the repository.
    path?: string;
    // Commit the document is being read at, without which repository-relative
    // images cannot be resolved.
    sha?: string;
    // If true, add <br> on a single line break
    breaks?: boolean;
    toggleTaskItem?: (content: string) => Promise<void> | void;
    // Opens a file linked from the document. By default it opens in the
    // source view of the repository at its default branch.
    onNavigate?: OpenFile;
  }

  const {
    rid = "",
    content,
    path = "",
    sha = undefined,
    breaks = false,
    toggleTaskItem = undefined,
    onNavigate = undefined,
  }: Props = $props();

  const openFile = $derived(
    onNavigate ??
      (rid
        ? (filePath: string | undefined, fragment: string | undefined) =>
            void router.push(
              { resource: "repo.home", rid, path: filePath },
              fragment,
            )
        : undefined),
  );

  let taskInFlight = $state(false);
  let refocusTask: number | undefined = undefined;
  let scrolledAt: string | undefined;

  let container: HTMLElement;

  let mountedMentions: ReturnType<typeof mount>[] = [];

  function unmountMentions() {
    for (const instance of mountedMentions) {
      void unmount(instance);
    }
    mountedMentions = [];
  }

  $effect(() => unmountMentions);

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative oid→element lookup, never rendered reactively
  const embedPreviews = new Map<
    string,
    { element: HTMLElement; url: string }
  >();

  const images = new RepoImages();

  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- imperative warning→icon lookup, never rendered reactively
  const diagramWarningIcons = new Map<HTMLElement, ReturnType<typeof mount>>();

  function unmountDiagramWarningIcons(all: boolean) {
    for (const [warning, icon] of diagramWarningIcons) {
      if (all || !warning.isConnected) {
        void unmount(icon);
        diagramWarningIcons.delete(warning);
      }
    }
  }

  let destroyed = false;

  $effect(() => () => {
    destroyed = true;
    for (const { url } of embedPreviews.values()) {
      URL.revokeObjectURL(url);
    }
    embedPreviews.clear();
    images.dispose();
    unmountDiagramWarningIcons(true);
  });

  // The revision and path of a document can change while its text stays the
  // same, so images are resolved apart from the rest of the markup.
  $effect(() => {
    const source = { rid, sha, path };
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    content;

    void tick().then(() => {
      if (container) {
        enhanceRepoImages(container, source, images);
      }
    });
  });

  $effect(() => {
    const diagramTheme = $theme;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    content;

    void tick().then(async () => {
      if (!container) {
        return;
      }
      unmountDiagramWarningIcons(false);
      await renderMermaidBlocks(container, diagramTheme, {
        decorateWarning: warning => {
          diagramWarningIcons.set(
            warning,
            mount(Icon, { target: warning, props: { name: "warning" } }),
          );
        },
      });
    });
  });

  function createEmbedPreview(
    mimeType: string | undefined,
    url: string,
    content: Uint8Array,
  ): HTMLElement | undefined {
    const kind = embedPreviewKind(mimeType);
    if (kind === "image") {
      const element = document.createElement("img");
      const width = retinaWidth(content);
      if (width) {
        element.style.width = `${width}px`;
      }
      element.setAttribute("src", url);
      element.style.display = "block";
      return element;
    } else if (kind === "document") {
      const element = document.createElement("embed");
      element.setAttribute("src", url);
      element.type = mimeType ?? "";
      element.style.overflow = "scroll";
      element.style.height = "40rem";
      element.style.overscrollBehavior = "contain";
      return element;
    } else if (kind === "video") {
      const element = document.createElement("video");
      const node = document.createElement("source");
      node.src = url;
      element.controls = true;
      node.type = mimeType ?? "";
      element.style.width = "100%";
      element.appendChild(node);
      return element;
    } else if (kind === "audio") {
      const element = document.createElement("audio");
      element.style.display = "block";
      element.src = url;
      element.controls = true;
      return element;
    }
  }

  function placeEmbedPreview(link: HTMLAnchorElement, element: HTMLElement) {
    link.style.display = "block";
    link.insertAdjacentElement(
      "afterend",
      container.contains(element)
        ? (element.cloneNode(true) as HTMLElement)
        : element,
    );
  }

  const doc = $derived(parseFrontmatter(content));
  const frontMatter = $derived.by(() => {
    try {
      return Object.entries(doc.data).filter(
        ([, val]) => typeof val === "string" || typeof val === "number",
      );
    } catch (error) {
      console.error("Not able to parse frontmatter: ", error);
    }
  });

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    content;

    const icons: ReturnType<typeof mount>[] = [];

    void tick().then(() => {
      // Don't run this if the component hasn't mounted yet.
      if (container === null) {
        return;
      }

      unmountMentions();

      twemoji(container, { exclude: ["21a9"] });

      let taskIndex = 0;
      for (const i of container.querySelectorAll('input[type="checkbox"]')) {
        const isTask = isTaskCheckbox(i);
        const index = isTask ? taskIndex++ : -1;
        const item = i.closest("li");
        item?.classList.add("task-item");
        const checked = i.hasAttribute("checked");
        const interactive = toggleTaskItem !== undefined && isTask;
        const box = document.createElement(interactive ? "button" : "span");
        box.classList.add("task-box");
        box.classList.toggle("checked", checked);
        icons.push(mount(Icon, { target: box, props: { name: "checkmark" } }));

        if (interactive && box instanceof HTMLButtonElement) {
          box.type = "button";
          box.setAttribute("role", "checkbox");
          box.setAttribute("aria-checked", String(checked));
          const label = item?.cloneNode(true) as HTMLElement | undefined;
          label?.querySelectorAll("ul, ol").forEach(list => list.remove());
          box.setAttribute("aria-label", label?.textContent?.trim() || "Task");
          const setChecked = (value: boolean) => {
            box.classList.toggle("checked", value);
            box.setAttribute("aria-checked", String(value));
          };
          box.onclick = async () => {
            if (taskInFlight || !toggleTaskItem) {
              return;
            }
            const source = content;
            const next = toggleTask(source, index);
            if (next === undefined) {
              console.warn("Not able to find task item in markdown source");
              return;
            }
            taskInFlight = true;
            if (document.activeElement === box) {
              refocusTask = index;
            }
            setChecked(!checked);
            try {
              await toggleTaskItem(next);
            } catch (error) {
              console.error("Not able to save task item: ", error);
            } finally {
              taskInFlight = false;
              if (content === source) {
                setChecked(checked);
                refocusTask = undefined;
              }
            }
          };
        }

        i.replaceWith(box);
        if (interactive && index === refocusTask) {
          refocusTask = undefined;
          box.focus();
        }

        const text = box.nextSibling;
        if (text?.nodeType === Node.TEXT_NODE && text.textContent) {
          text.textContent = text.textContent.replace(/^[ \t]+/, "");
        }
      }

      for (const list of container.querySelectorAll("ul, ol")) {
        const items = Array.from(list.children);
        if (
          items.length > 0 &&
          items.every(c => c.classList.contains("task-item"))
        ) {
          list.classList.add("task-list");
          const lead = list.previousElementSibling;
          if (lead instanceof HTMLParagraphElement) {
            lead.classList.add("task-list-lead");
          }
        }
      }

      let references = 0;
      for (const e of container.querySelectorAll("a")) {
        const rawHref = e.getAttribute("href") ?? "";
        const isReference = /^(?:rad|did):/i.test(rawHref);
        // Each reference looks itself up, so a comment from another peer
        // cannot make the app issue an unbounded number of lookups.
        if (isReference && references >= maximumReferences) {
          e.replaceWith(document.createTextNode(e.textContent ?? ""));
          continue;
        }
        if (isReference) references++;
        const entity = parseEntityHref(rawHref);
        if (entity) {
          const host = document.createElement("span");
          host.style.display = "inline";
          const fallback = e.textContent || rawHref;
          e.replaceWith(host);
          mountedMentions.push(
            mount(Mention, {
              target: host,
              props: { target: entity, fallback },
            }),
          );
          continue;
        }

        if (isReference) {
          const host = document.createElement("span");
          host.style.display = "inline";
          const label = e.textContent || rawHref;
          e.replaceWith(host);
          mountedMentions.push(
            mount(ReferenceLink, {
              target: host,
              props: { href: rawHref, label },
            }),
          );
          continue;
        }

        // Don't underline <a> tags that contain images.
        // Make an exception for emojis.
        if (
          e.firstElementChild instanceof HTMLImageElement &&
          !e.firstElementChild.classList.contains("txt-emoji")
        ) {
          e.classList.add("no-underline");
        }

        const href = e.getAttribute("href");

        if (!href || !isOid(href)) {
          enhanceDocumentLink(e, () => ({ path, openFile }));
        } else {
          e.onclick = event => {
            event.preventDefault();
            invoke("save_embed_to_disk", {
              rid,
              oid: href,
              name: e.innerText,
            }).catch(console.error);
          };
          const cached = embedPreviews.get(href);
          if (cached) {
            placeEmbedPreview(e, cached.element);
          } else {
            void invoke<ArrayBuffer>("get_embed", {
              rid,
              name: e.innerText,
              oid: href,
            })
              .then(buffer => {
                if (destroyed) {
                  return;
                }
                let preview = embedPreviews.get(href);
                if (!preview) {
                  const { mimeType, content } = decodeEmbed(buffer);
                  const url = URL.createObjectURL(new Blob([content]));
                  const element = createEmbedPreview(mimeType, url, content);
                  if (!element) {
                    URL.revokeObjectURL(url);
                    console.warn(
                      `Not able to provide a preview for this file.`,
                    );
                    return;
                  }
                  preview = { element, url };
                  embedPreviews.set(href, preview);
                }
                if (e.isConnected) {
                  placeEmbedPreview(e, preview.element);
                }
              })
              .catch(console.error);
          }
        }
      }

      for (const title of container.querySelectorAll("p.alert-title")) {
        const variant = alertVariants.find(name =>
          title.parentElement?.classList.contains(`alert-${name}`),
        );
        if (!variant) continue;

        icons.push(
          mount(Icon, {
            target: title,
            anchor: title.firstChild ?? undefined,
            props: { name: alertIcons[variant] },
          }),
        );
      }

      enhanceCodeBlocks(container);

      scrolledAt = scrollToLocationFragment(scrolledAt);
    });

    return () => {
      for (const icon of icons) {
        void unmount(icon);
      }
    };
  });
</script>

<style>
  :global(html) {
    scroll-padding-top: 4rem;
  }
  .markdown {
    word-break: break-word;
    -webkit-touch-callout: initial;
    -webkit-user-select: text;
    user-select: text;
  }
  .front-matter {
    font: var(--txt-body-s-regular);
    border: 1px dashed var(--color-border-mid);
    padding: 0.5rem;
    margin-bottom: 2rem;
  }
  .front-matter table {
    border-collapse: collapse;
  }
  .front-matter table td {
    padding: 0.125rem 1rem;
  }
  .front-matter table td:first-child {
    padding-left: 0.5rem;
  }

  .markdown :global(h1) {
    font: var(--txt-heading-l);
    padding: 1rem 0 0.5rem 0;
    margin: 0 0 0.75rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .markdown :global(h2) {
    font: var(--txt-heading-m);
    padding: 0.25rem 0;
    margin: 2rem 0 0.5rem;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .markdown :global(.pre-wrapper) {
    position: relative;
    margin: 1rem 0;
  }

  .markdown :global(radicle-clipboard) {
    display: none;
    position: absolute;
    right: 0.75rem;
    top: 0.75rem;
  }

  .markdown :global(radicle-clipboard) {
    background-color: var(--color-surface-subtle);
  }

  .markdown :global(.pre-wrapper:hover > radicle-clipboard) {
    display: flex;
  }

  .markdown :global(h3) {
    font: var(--txt-heading-m);
    padding: 0.5rem 0;
    margin: 1rem 0 0.25rem;
  }

  .markdown :global(h4) {
    font: var(--txt-body-l-semibold);
    padding: 0.5rem 0;
    margin: 1rem 0 0.125rem;
  }

  .markdown :global(h5),
  .markdown :global(h6) {
    font: var(--txt-body-m-semibold);
    padding: 0.35rem 0;
    margin: 1rem 0 0.125rem;
  }

  .markdown :global(h6) {
    color: var(--color-text-secondary);
  }

  .markdown :global(p) {
    line-height: 1.625rem;
    margin-top: 0;
    margin-bottom: 0.625rem;
  }

  .markdown :global(p:only-child) {
    margin-bottom: 0;
  }

  .markdown :global(li.task-item) {
    list-style-type: none;
    color: var(--color-text-secondary);
    padding-left: 1.75rem;
    text-indent: -1.75rem;
  }
  .markdown :global(li.task-item ul),
  .markdown :global(li.task-item ol),
  .markdown :global(li.task-item pre),
  .markdown :global(li.task-item blockquote),
  .markdown :global(li.task-item table) {
    text-indent: 0;
  }
  .markdown :global(.task-list) {
    padding-left: 0;
    margin-top: 0;
  }
  .markdown :global(p.task-list-lead) {
    margin-bottom: 0;
  }
  .markdown :global(li.task-item > p) {
    margin-bottom: 0;
  }
  .markdown :global(li.task-item .task-box) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.5rem;
    vertical-align: middle;
    position: relative;
    top: -0.09em;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-base);
  }
  .markdown :global(li.task-item .task-box.checked) {
    color: var(--color-text-brand);
  }
  .markdown :global(li.task-item .task-box:not(.checked) svg) {
    visibility: hidden;
  }
  .markdown :global(li.task-item button.task-box) {
    padding: 0;
    cursor: pointer;
    transition:
      background-color 0.1s ease,
      border-color 0.1s ease;
  }
  .markdown :global(li.task-item button.task-box:focus-visible) {
    outline: 2px solid var(--color-border-brand);
    outline-offset: 1px;
  }
  .markdown.busy :global(li.task-item button.task-box) {
    cursor: progress;
  }
  .markdown :global(li.task-item button.task-box:hover) {
    border-color: var(--color-border-strong);
    background-color: var(--color-surface-subtle);
  }
  .markdown :global(li.task-item:not(:last-child)) {
    margin-bottom: 0.25rem;
  }

  .markdown :global(blockquote) {
    color: var(--color-text-secondary);
    border-left: 0.3rem solid var(--color-surface-subtle);
    padding: 0 0 0 1rem;
    margin: 1rem 0 1rem 0;
  }

  .markdown :global(strong) {
    font-weight: 600;
  }

  .markdown :global(.footnote-ref) {
    vertical-align: top;
    position: relative;
    top: -0.4rem;
  }
  .markdown :global(.footnote-ref),
  .markdown :global(.footnote > .marker),
  .markdown :global(.footnote > .ref-arrow) {
    color: var(--color-text-secondary);
  }
  .markdown :global(.footnote-ref:hover),
  .markdown :global(.footnote .ref-arrow:hover) {
    color: var(--color-surface-base);
  }
  .markdown :global(.footnote) {
    margin-bottom: 0;
  }

  .markdown :global(img) {
    border-style: none;
    max-width: 100%;
  }

  .markdown :global(code) {
    font: var(--txt-code-regular);
    background-color: var(--color-surface-subtle);
    padding: 0.125rem 0.25rem;
  }

  .markdown :global(pre > code) {
    background: none;
    padding: 0;
  }

  .markdown :global(:not(pre) > code) {
    font-size: inherit;
  }

  .markdown :global(pre) {
    font: var(--txt-code-regular);
    background-color: var(--color-surface-subtle);
    padding: 1rem !important;
    overflow: scroll;
    scrollbar-width: none;
    border-radius: var(--border-radius-sm);
  }

  .markdown :global(pre::-webkit-scrollbar) {
    display: none;
  }

  .markdown :global(a),
  .markdown :global(a > code) {
    color: var(--color-text-primary);
    background: none;
    padding: 0;
  }
  .markdown :global(a) {
    text-decoration: underline;
    text-decoration-color: var(--color-text-secondary);
  }
  .markdown :global(a.no-underline) {
    text-decoration: none;
  }
  .markdown :global(a:hover) {
    text-decoration-color: var(--color-text-primary);
  }

  .markdown :global(hr) {
    height: 0;
    margin: 1rem 0;
    overflow: hidden;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .markdown :global(ol) {
    line-height: 1.625rem;
    list-style-type: decimal;
    margin-bottom: 1rem;
    padding-left: 2.5rem;
  }

  .markdown :global(ul) {
    line-height: 1.625rem;
    list-style-type: inherit;
    padding-left: 1.25rem;
    margin-bottom: 1rem;
  }
  .markdown :global(.list-content) {
    margin: 1rem 0;
  }
  /* Allows the parent to specify its own bottom margin */
  .markdown :global(> :last-child) {
    margin-bottom: 0;
  }
  .markdown :global(li > ul) {
    margin-bottom: 0rem;
  }
  .markdown :global(li > ol) {
    margin-bottom: 0rem;
  }
  .markdown :global(table) {
    margin: 1.5rem 0;
    border-collapse: collapse;
    border-style: hidden;
    box-shadow: 0 0 0 1px var(--color-border-subtle);
    overflow: hidden;
  }
  .markdown :global(td) {
    text-align: left;
    border: 1px solid var(--color-border-subtle);
    padding: 0.5rem 1rem;
    word-break: normal;
    overflow-wrap: normal;
  }
  .markdown :global(tr:nth-child(even)) {
    background-color: var(--color-surface-base);
  }
  .markdown :global(th) {
    text-align: center;
    padding: 0.5rem 1rem;
    word-break: normal;
    overflow-wrap: normal;
  }

  .markdown :global(*:first-child:not(pre)) {
    padding-top: 0 !important;
  }
  .markdown :global(*:first-child) {
    margin-top: 0 !important;
  }
  .markdown :global(dl dt) {
    font-style: italic;
    margin-top: 1rem;
  }
  .markdown :global(dl dd) {
    margin: 0 0 0 2rem;
  }

  .markdown :global(.alert) {
    border-left: 0.3rem solid var(--alert-color);
    padding: 0 0 0 1rem;
    margin: 1rem 0;
  }
  .markdown :global(.alert > .alert-title) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--alert-color);
    font: var(--txt-body-m-semibold);
    margin-bottom: 0.375rem;
  }
  .markdown :global(.alert > :last-child) {
    margin-bottom: 0;
  }
  .markdown :global(.alert-note) {
    --alert-color: var(--color-feedback-info-text);
  }
  .markdown :global(.alert-tip) {
    --alert-color: var(--color-feedback-success-text);
  }
  .markdown :global(.alert-important) {
    --alert-color: var(--color-feedback-important-text);
  }
  .markdown :global(.alert-warning) {
    --alert-color: var(--color-feedback-warning-text);
  }
  .markdown :global(.alert-caution) {
    --alert-color: var(--color-feedback-error-text);
  }

  .markdown :global(.mermaid-diagram) {
    margin: 1rem 0;
    text-align: center;
  }
  .markdown :global(.mermaid-diagram svg) {
    max-width: 100%;
    height: auto;
  }
  .markdown :global(.mermaid-error) {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-feedback-warning-text);
    font: var(--txt-body-s-regular);
    margin: 1rem 0 0.25rem;
  }
</style>

{#if frontMatter && frontMatter.length > 0}
  <div class="front-matter">
    <table>
      <tbody>
        {#each frontMatter as [key, val]}
          <tr>
            <td><span class="txt-body-l-semibold">{key}</span></td>
            <td>{val}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<div
  class="markdown"
  class:busy={taskInFlight}
  aria-busy={taskInFlight}
  bind:this={container}>
  {@html renderMarkdown(doc.content, breaks)}
</div>
