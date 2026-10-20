const fadeWidth = "3rem";

export function overflowFade(node: HTMLElement) {
  function update() {
    const start = node.scrollLeft > 0;
    const end = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
    const mask =
      start || end
        ? `linear-gradient(to right, ${start ? "transparent" : "black"} 0, black ${start ? fadeWidth : "0"}, black calc(100% - ${end ? fadeWidth : "0px"}), ${end ? "transparent" : "black"} 100%)`
        : "";
    node.style.maskImage = mask;
    node.style.webkitMaskImage = mask;
  }

  const observer = new ResizeObserver(update);
  observer.observe(node);
  for (const child of node.children) {
    observer.observe(child);
  }
  node.addEventListener("scroll", update, { passive: true });
  update();

  return {
    destroy() {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    },
  };
}
