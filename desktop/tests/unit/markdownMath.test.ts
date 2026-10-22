import { expect, test } from "vitest";

import { renderMarkdown } from "@app/lib/markdown";

// DOMPurify under happy-dom drops a document's first element, so each
// document starts with a paragraph that isn't under test.
function render(content: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(`intro\n\n${content}`);
  return element;
}

test("renders inline math with KaTeX", () => {
  const math = render("inline $3x^{-1}+(1+x)^2$ math").querySelector(
    "p .katex",
  );
  expect(math?.querySelector(".katex-html")).not.toBeNull();
  expect(math?.querySelector("annotation")?.textContent).toBe(
    "3x^{-1}+(1+x)^2",
  );
});

test("renders block math in display mode", () => {
  const element = render("$$\n\\sum_{k=1}^n a_k\n$$\n");
  expect(element.querySelector(".katex-display .katex-html")).not.toBeNull();
});
