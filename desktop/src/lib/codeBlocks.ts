import { toDom } from "hast-util-to-dom";

import { highlight } from "@app/lib/syntax";

const languagePrefix = "language-";

/**
 * Adds a copy button to every `pre code` block in `container` and replaces
 * the blocks that name a language with highlighted code in the background.
 */
export function enhanceCodeBlocks(container: HTMLElement) {
  for (const node of container.querySelectorAll("pre code")) {
    const preElement = node.parentElement as HTMLElement;
    const copyButton = document.createElement("radicle-clipboard");
    copyButton.setAttribute("text", node.textContent || "");
    const preWrapper = document.createElement("div");
    preWrapper.classList.add("pre-wrapper");
    preElement.parentNode?.insertBefore(preWrapper, preElement);
    preWrapper.appendChild(preElement);
    preWrapper.appendChild(copyButton);

    const className = Array.from(node.classList).find(name =>
      name.startsWith(languagePrefix),
    );
    if (!className) continue;

    highlight(node.textContent ?? "", className.slice(languagePrefix.length))
      .then(tree => {
        if (tree) {
          node.replaceChildren(toDom(tree, { fragment: true }));
        }
      })
      .catch(e => console.warn("Not able to highlight code block", e));
  }
}
