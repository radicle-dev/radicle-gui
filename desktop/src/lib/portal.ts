export function portal(node: HTMLElement, target: HTMLElement = document.body) {
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
