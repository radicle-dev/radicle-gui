import { describe, expect, test, vi } from "vitest";

import { renderMermaidBlocks } from "@app/lib/mermaid";

function documentWith(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

const diagram =
  '<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>';

function fakeRender() {
  return vi.fn(
    async (source: string, theme: string) =>
      `<svg data-theme="${theme}">${source}</svg>`,
  );
}

describe("renderMermaidBlocks", () => {
  test("replaces a mermaid block with its diagram", async () => {
    const render = fakeRender();
    const container = documentWith(
      `${diagram}<pre><code class="language-rust">fn main() {}</code></pre>`,
    );

    await renderMermaidBlocks(container, "dark", { render });

    expect(render).toHaveBeenCalledExactlyOnceWith("graph TD; A-->B", "dark");
    expect(container.querySelector(".mermaid-diagram svg")).not.toBeNull();
    expect(container.querySelector("code.language-mermaid")).toBeNull();
    expect(container.querySelector("code.language-rust")).not.toBeNull();
  });

  test("replaces the copy button wrapper along with the code", async () => {
    const container = documentWith(
      `<div class="pre-wrapper">${diagram}<radicle-clipboard></radicle-clipboard></div>`,
    );

    await renderMermaidBlocks(container, "dark", { render: fakeRender() });

    expect(container.querySelector(".pre-wrapper")).toBeNull();
    expect(container.querySelector(".mermaid-diagram")).not.toBeNull();
  });

  test("redraws diagrams only when the theme changes", async () => {
    const render = fakeRender();
    const container = documentWith(diagram);

    await renderMermaidBlocks(container, "dark", { render });
    await renderMermaidBlocks(container, "dark", { render });
    await renderMermaidBlocks(container, "light", { render });

    expect(render.mock.calls.map(([, theme]) => theme)).toEqual([
      "dark",
      "light",
    ]);
    expect(render.mock.calls[1][0]).toBe("graph TD; A-->B");
    expect(container.querySelectorAll(".mermaid-diagram")).toHaveLength(1);
    expect(container.querySelector("svg")?.getAttribute("data-theme")).toBe(
      "light",
    );
  });

  test("keeps a diagram that fails to draw as code under one warning", async () => {
    const render = vi.fn().mockRejectedValue(new Error("Parse error"));
    const decorateWarning = vi.fn();
    const container = documentWith(diagram);
    vi.spyOn(console, "warn").mockReturnValue(undefined);

    await renderMermaidBlocks(container, "dark", { render, decorateWarning });
    await renderMermaidBlocks(container, "light", { render, decorateWarning });

    expect(container.querySelector("code.language-mermaid")).not.toBeNull();
    expect(container.querySelectorAll(".mermaid-error")).toHaveLength(1);
    expect(decorateWarning).toHaveBeenCalledOnce();
  });

  test("keeps the last diagram when redrawing it fails", async () => {
    const render = vi
      .fn()
      .mockResolvedValueOnce("<svg></svg>")
      .mockRejectedValue(new Error("Not able to load mermaid"));
    const container = documentWith(diagram);
    vi.spyOn(console, "warn").mockReturnValue(undefined);

    await renderMermaidBlocks(container, "dark", { render });
    await renderMermaidBlocks(container, "light", { render });

    expect(container.querySelector(".mermaid-diagram svg")).not.toBeNull();
    expect(container.querySelector(".mermaid-error")).toBeNull();
  });

  test("a theme asked for later wins over one still drawing", async () => {
    let finishDark!: (svg: string) => void;
    const render = vi
      .fn()
      .mockReturnValueOnce(new Promise(resolve => (finishDark = resolve)))
      .mockResolvedValueOnce('<svg data-theme="light"></svg>');
    const container = documentWith(diagram);

    const dark = renderMermaidBlocks(container, "dark", { render });
    await renderMermaidBlocks(container, "light", { render });
    finishDark('<svg data-theme="dark"></svg>');
    await dark;

    expect(container.querySelector("svg")?.getAttribute("data-theme")).toBe(
      "light",
    );
  });
});

describe("renderDiagram", () => {
  test("tries loading mermaid again after a failed load", async () => {
    vi.resetModules();
    vi.doMock("mermaid", () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const { renderDiagram } = await import("@app/lib/mermaid");

    await expect(renderDiagram("graph TD; A-->B", "dark")).rejects.toThrow();

    vi.doMock("mermaid", () => ({
      default: {
        initialize: vi.fn(),
        render: vi.fn(async () => ({ svg: "<svg></svg>" })),
      },
    }));

    await expect(renderDiagram("graph TD; A-->B", "dark")).resolves.toBe(
      "<svg></svg>",
    );
    vi.doUnmock("mermaid");
  });
});
