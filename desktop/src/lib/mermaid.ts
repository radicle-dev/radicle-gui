export type DiagramTheme = "dark" | "light";

export type RenderDiagram = (
  source: string,
  theme: DiagramTheme,
) => Promise<string>;

// Mermaid is heavy and `initialize` mutates a process wide singleton, so load
// it lazily and share the one instance across every document.
let mermaidPromise: Promise<typeof import("mermaid").default> | undefined;
let mermaidTheme: DiagramTheme | undefined;

async function loadMermaid(theme: DiagramTheme) {
  mermaidPromise ??= import("mermaid").then(
    ({ default: mermaid }) => mermaid,
    error => {
      // Forget the failed import, so that the next diagram tries again.
      mermaidPromise = undefined;
      throw error;
    },
  );
  const mermaid = await mermaidPromise;

  // `initialize` replaces the entire site config, so it is passed in full and
  // only re-run when the app theme changed since the last diagram.
  if (mermaidTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      // Render our own warning instead of letting mermaid append its
      // "Syntax error" graphic to the document.
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "default",
    });
    mermaidTheme = theme;
  }

  return mermaid;
}

export const renderDiagram: RenderDiagram = async (source, theme) => {
  const mermaid = await loadMermaid(theme);
  const { svg } = await mermaid.render(
    `mermaid-${crypto.randomUUID()}`,
    source,
  );
  return svg;
};

/**
 * Replaces the mermaid code blocks in `container` with diagrams, and redraws
 * the diagrams drawn for another theme. A block that can't be drawn stays as
 * code, under a warning that `decorateWarning` can add to.
 */
export async function renderMermaidBlocks(
  container: HTMLElement,
  theme: DiagramTheme,
  {
    render = renderDiagram,
    decorateWarning,
  }: {
    render?: RenderDiagram;
    decorateWarning?: (warning: HTMLElement) => void;
  } = {},
) {
  for (const code of container.querySelectorAll("pre code.language-mermaid")) {
    if (code.closest(".mermaid-block")) {
      continue;
    }
    const pre = code.parentElement as HTMLElement;
    const target = pre.closest(".pre-wrapper") ?? pre;
    const block = document.createElement("div");
    block.classList.add("mermaid-block");
    block.dataset.source = code.textContent ?? "";
    target.replaceWith(block);
    block.appendChild(target);
  }

  const pending: Promise<void>[] = [];
  for (const block of container.querySelectorAll<HTMLElement>(
    ".mermaid-block",
  )) {
    if (block.dataset.theme === theme) {
      continue;
    }
    block.dataset.theme = theme;
    pending.push(renderBlock(block, theme, render, decorateWarning));
  }
  await Promise.all(pending);
}

async function renderBlock(
  block: HTMLElement,
  theme: DiagramTheme,
  render: RenderDiagram,
  decorateWarning: ((warning: HTMLElement) => void) | undefined,
) {
  try {
    const svg = await render(block.dataset.source ?? "", theme);
    // Another theme may have been asked for while this one was drawn.
    if (block.dataset.theme !== theme) {
      return;
    }
    const diagram = document.createElement("div");
    diagram.classList.add("mermaid-diagram");
    diagram.innerHTML = svg;
    block.replaceChildren(diagram);
  } catch (error) {
    console.warn("Not able to render mermaid diagram", error);
    // A diagram drawn for the previous theme is still better than code.
    if (block.querySelector(".mermaid-diagram, .mermaid-error")) {
      return;
    }
    const warning = document.createElement("div");
    warning.classList.add("mermaid-error");
    decorateWarning?.(warning);
    const message = document.createElement("span");
    message.textContent = "Couldn't render diagram";
    warning.appendChild(message);
    block.prepend(warning);
  }
}
