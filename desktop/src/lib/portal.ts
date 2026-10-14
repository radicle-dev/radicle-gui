// Portaled nodes are marked so code that asks "is this click inside X" can
// still count overlays X opened, such as an input's suggestions.
export function portal(node: HTMLElement, target: HTMLElement = document.body) {
  node.dataset.portal = "";
  const placeholder = document.createComment("portal");
  node.replaceWith(placeholder);
  target.appendChild(node);

  return {
    destroy() {
      node.remove();
      placeholder.remove();
    },
  };
}
