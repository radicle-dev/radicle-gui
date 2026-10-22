import { describe, expect, test } from "vitest";

import { Renderer, renderMarkdown } from "@app/lib/markdown";

function render(content: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = renderMarkdown(
    content,
    new Renderer({ resource: "booting" }),
    false,
  );
  return element;
}

describe("math", () => {
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

  test("keeps sanitizing the rest of the document", () => {
    const element = render(
      '$x$ <span style="position:fixed">overlay</span><img src=x onerror="alert(1)">',
    );
    expect(element.querySelector(".katex")).not.toBeNull();
    expect(element.querySelector("[style*=fixed]")).toBeNull();
    expect(element.querySelector("[onerror]")).toBeNull();
  });
});
