<script context="module" lang="ts">
  // Mermaid is heavy (~700 KB gzipped) and initialize() mutates a
  // process-wide singleton, so load and configure it at most once across
  // all Markdown instances and afterUpdate firings.
  let mermaidPromise: Promise<typeof import("mermaid").default> | undefined;

  function loadMermaid(): Promise<typeof import("mermaid").default> {
    if (!mermaidPromise) {
      mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          // Don't let mermaid inject its own "Syntax error" bomb into the
          // document; we render a custom warning instead.
          suppressErrorRendering: true,
        });
        return mermaid;
      });
    }
    return mermaidPromise;
  }
</script>

<script lang="ts">
  import { afterUpdate } from "svelte";
  import { toDom } from "hast-util-to-dom";

  import * as router from "@app/lib/router";
  import * as modal from "@app/lib/modal";
  import ErrorModal from "@app/modals/ErrorModal.svelte";
  import { activeUnloadedRouteStore } from "@app/lib/router";
  import { highlight } from "@app/lib/syntax";
  import { mimes } from "@app/lib/file";
  import {
    isUrl,
    twemoji,
    untwemoji,
    scrollIntoView,
    canonicalize,
    canonicalizeGithubImageUrl,
    isCommit,
  } from "@app/lib/utils";
  import { Renderer, renderMarkdown } from "@app/lib/markdown";
  import { parseFrontmatter } from "@app/lib/frontmatter";

  export let content: string;
  export let path: string = "/";
  export let rawPath: string;
  // If true, add <br> on a single line break
  export let breaks: boolean = false;

  let container: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let frontMatter: [string, any][] | undefined = undefined;

  $: {
    try {
      const doc = parseFrontmatter(content);
      content = doc.content;
      frontMatter = Object.entries(doc.data).filter(
        ([, val]) => typeof val === "string" || typeof val === "number",
      );
    } catch (error) {
      if (error instanceof Error) {
        modal.show({
          component: ErrorModal,
          props: {
            title: "Not able to parse frontmatter",
            subtitle: [
              "There was an error while trying to parse the frontmatter in this document.",
              "Check your dev console logs for details.",
            ],
            error: {
              message: error.message,
              stack: error.stack,
            },
          },
        });
      }
    }
  }

  /**
   * Do internal navigation for clicks on anchor elements if possible
   */
  function navigateInternalOnAnchor(event: MouseEvent) {
    if (router.useDefaultNavigation(event)) {
      return;
    }

    let url: URL;
    if (!(event.target instanceof HTMLAnchorElement)) {
      return;
    }
    const href = event.target?.getAttribute("href");
    if (href === null || href.startsWith("#")) {
      return;
    }

    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }

    if (url.origin === window.origin) {
      event.preventDefault();
      void router.navigateToUrl("push", url);
    }
  }

  function render(content: string): string {
    return renderMarkdown(
      content,
      new Renderer($activeUnloadedRouteStore),
      breaks,
    );
  }

  afterUpdate(async () => {
    for (const e of container.querySelectorAll("a")) {
      try {
        const url = new URL(e.href);
        if (url.origin !== window.origin) {
          e.target = "_blank";
          e.rel = "noopener noreferrer";
        }
      } catch (e) {
        console.warn("Not able to parse url", e);
      }

      const anchorHref = e.getAttribute("href");

      // If the anchor is an oid embed
      if (anchorHref && isCommit(anchorHref)) {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const url = new URL(rawPath);
        // deprecated with httpd 0.18.1
        // For older httpd versions we still pass the mime type.
        // On newer radicle-httpd instances we try to infer the file type on httpd.
        const fileExtension = e.innerText.split(".").pop();
        if (fileExtension && fileExtension in mimes) {
          url.search = `?mime=${mimes[fileExtension]}`;
        }
        url.pathname = canonicalize(`blobs/${anchorHref}`, url.pathname);
        e.setAttribute("href", url.toString());

        // To determine the filetype of the embed we query the content-type of the resource URL.
        const req = await fetch(url, { method: "HEAD" });
        const mimeType = req.headers.get("Content-Type");

        // Embed an img element below the link
        if (mimeType?.startsWith("image")) {
          const element = document.createElement("img");
          element.setAttribute("src", url.toString());
          element.style.display = "block";
          e.style.display = "block";
          e.insertAdjacentElement("afterend", element);
          // Embed an iframe to display pdf correctly element below the link
        } else if (mimeType?.startsWith("application/pdf")) {
          const element = document.createElement("embed");
          element.setAttribute("src", url.toString());
          element.type = mimeType;
          element.style.overflow = "scroll";
          element.style.height = "40rem";
          element.style.overscrollBehavior = "contain";
          e.style.display = "block";
          e.insertAdjacentElement("afterend", element);
        } else if (mimeType?.startsWith("video")) {
          const element = document.createElement("video");
          const node = document.createElement("source");
          node.src = url.toString();
          element.controls = true;
          node.type = mimeType;
          element.style.width = "100%";
          e.style.display = "block";
          element.appendChild(node);
          e.insertAdjacentElement("afterend", element);
        } else if (mimeType?.startsWith("audio")) {
          const element = document.createElement("audio");
          element.style.display = "block";
          element.src = url.toString();
          element.controls = true;
          e.style.display = "block";
          e.insertAdjacentElement("afterend", element);
        } else {
          console.warn(`Not able to provide a preview for this file.`);
        }

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
    }

    // Replace standard HTML checkboxes with a custom styled box.
    for (const i of container.querySelectorAll('input[type="checkbox"]')) {
      i.parentElement?.classList.add("task-item");

      const box = document.createElement("span");
      box.classList.add("task-box");
      if (i.hasAttribute("checked")) {
        box.classList.add("checked");
        const icon = document.createElement("radicle-icon-small");
        icon.setAttribute("name", "checkmark");
        box.appendChild(icon);
      }
      i.replaceWith(box);
    }

    // Iterate over all images, and replace the source with a canonicalized URL
    // pointing at the repos /raw endpoint.
    for (const i of container.querySelectorAll("img")) {
      const imagePath = i.getAttribute("src");
      const imageClass = i.getAttribute("class");

      const emoji = imageClass && imageClass === "txt-emoji";
      if (imagePath && !emoji) {
        if (isUrl(imagePath)) {
          // Rewrite GitHub "blob" URLs so the raw image content is rendered.
          i.setAttribute("src", canonicalizeGithubImageUrl(imagePath));
        } else {
          i.setAttribute("src", `${rawPath}/${canonicalize(imagePath, path)}`);
        }
      }
    }

    // Replaces code blocks in the background with highlighted code.
    const prefix = "language-";
    const nodes = Array.from(container.querySelectorAll("pre code"));

    const treeChanges: Promise<void>[] = [];

    for (const node of nodes) {
      const preElement = node.parentElement as HTMLElement;
      const copyButton = document.createElement("radicle-clipboard");
      untwemoji(node);
      copyButton.setAttribute("text", node.textContent || "");
      // Create a wrapper around the pre element,
      // so we can position the copy button that works even when scrolling horizontally.
      const preWrapper = document.createElement("div");
      preWrapper.classList.add("pre-wrapper");
      preElement.parentNode?.insertBefore(preWrapper, preElement);
      preWrapper.appendChild(preElement);
      preWrapper.appendChild(copyButton);

      const className = Array.from(node.classList).find(name =>
        name.startsWith(prefix),
      );
      if (!className) continue;

      const language = className.slice(prefix.length);

      if (language === "mermaid") {
        const mermaid = await loadMermaid();
        const diagramId = `mermaid-${crypto.randomUUID()}`;
        try {
          const { svg } = await mermaid.render(
            diagramId,
            node.textContent ?? "",
          );
          // The component may have re-rendered or unmounted while we were
          // awaiting; in that case `preWrapper` is detached and there's
          // nothing to replace.
          if (preWrapper.isConnected) {
            const mermaidDiv = document.createElement("div");
            mermaidDiv.innerHTML = svg;
            mermaidDiv.classList.add("mermaid-diagram");
            preWrapper.replaceWith(mermaidDiv);
          }
        } catch (error) {
          console.warn("Not able to render mermaid diagram", error);
          if (preWrapper.isConnected) {
            const warning = document.createElement("div");
            warning.classList.add("mermaid-error");
            const icon = document.createElement("radicle-icon-small");
            icon.setAttribute("name", "warning");
            warning.appendChild(icon);
            const text = document.createElement("span");
            text.textContent = "Couldn’t render diagram";
            warning.appendChild(text);
            preWrapper.before(warning);
          }
        }
        continue;
      }

      treeChanges.push(
        highlight(node.textContent ?? "", language)
          .then(tree => {
            if (tree) {
              node.replaceChildren(toDom(tree, { fragment: true }));
            }
          })
          .catch(e => console.warn("Not able to highlight code block", e)),
      );
    }

    await Promise.allSettled(treeChanges);

    if (window.location.hash) {
      scrollIntoView(window.location.hash.substring(1));
    }
  });
</script>

<style>
  :global(html) {
    scroll-padding-top: 4rem;
  }
  .markdown {
    word-break: break-word;
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
    right: 0.5rem;
    top: 0.5rem;
  }

  .markdown :global(radicle-clipboard) {
    background-color: var(--color-surface-alpha-mid);
    border-radius: var(--border-radius-sm);
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
    color: var(--color-text-tertiary);
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
    color: var(--color-text-tertiary);
  }
  .markdown :global(li.task-item .task-box) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.5rem;
    vertical-align: middle;
    border: 1px solid var(--color-border-mid);
    border-radius: var(--border-radius-md);
    background-color: var(--color-surface-base);
  }
  .markdown :global(li.task-item .task-box.checked) {
    color: var(--color-text-brand);
  }
  .markdown :global(li.task-item:not(:last-child)) {
    margin-bottom: 0.25rem;
  }

  .markdown :global(blockquote) {
    color: var(--color-text-tertiary);
    border-left: 0.3rem solid var(--color-surface-alpha-mid);
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
    color: var(--color-text-tertiary);
  }
  .markdown :global(.footnote) {
    margin-bottom: 0;
  }

  .markdown :global(img) {
    border-style: none;
    max-width: 100%;
  }

  .markdown :global(img.txt-emoji) {
    height: 1rem;
  }

  .markdown :global(code) {
    font: var(--txt-code-regular);
    background-color: var(--color-surface-alpha-mid);
    border-radius: var(--border-radius-sm);
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
    background-color: var(--color-surface-alpha-mid);
    padding: 1rem !important;
    border-radius: var(--border-radius-sm);
    overflow: scroll;
    scrollbar-width: none;
  }

  .markdown :global(pre::-webkit-scrollbar) {
    display: none;
  }

  .markdown :global(a),
  .markdown :global(a > code) {
    background: none;
    padding: 0;
  }
  .markdown :global(a) {
    text-decoration: underline;
    text-decoration-color: var(--color-text-tertiary);
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
    line-height: 1.625;
    list-style-type: decimal;
    margin-bottom: 1rem;
    padding-left: 2rem;
  }

  .markdown :global(ul) {
    line-height: 1.625;
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
    border-radius: var(--border-radius-sm);
    border-style: hidden;
    box-shadow: 0 0 0 1px var(--color-border-subtle);
    overflow: hidden;
  }
  .markdown :global(td) {
    text-align: left;
    text-overflow: ellipsis;
    border: 1px solid var(--color-border-subtle);
    padding: 0.5rem 1rem;
  }
  .markdown :global(tr:nth-child(even)) {
    background-color: var(--color-surface-base);
  }
  .markdown :global(th) {
    text-align: center;
    padding: 0.5rem 1rem;
  }

  .markdown :global(*:first-child:not(pre)) {
    padding-top: 0 !important;
  }
  .markdown :global(*:first-child) {
    margin-top: 0 !important;
  }
  .markdown :global(dl dt) {
    margin-top: 1rem;
  }
  .markdown :global(dl dd) {
    margin: 0 0 0 2rem;
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
            <td><span class="txt-body-m-semibold">{key}</span></td>
            <td>{val}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- The click handler only handles bubbling events from anchor tags -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="markdown"
  bind:this={container}
  use:twemoji={{ exclude: ["21a9"] }}
  on:click={navigateInternalOnAnchor}>
  {@html render(content)}
</div>
