import {
  autoUpdate,
  computePosition,
  hide,
  offset,
  shift,
  size,
} from "@floating-ui/dom";

const gap = 8;
const padding = 8;
const maxHeight = 384;

export function positionInputPopover(
  reference: HTMLElement,
  floating: HTMLElement,
): () => void {
  return autoUpdate(reference, floating, () => {
    const spaceAbove = reference.getBoundingClientRect().top - gap - padding;
    const placement = spaceAbove >= maxHeight ? "top-start" : "bottom-start";

    void computePosition(reference, floating, {
      placement,
      middleware: [
        offset(gap),
        shift({ padding }),
        hide({ padding }),
        size({
          padding,
          apply({ availableHeight, rects, elements }) {
            elements.floating.style.minWidth = `${rects.reference.width}px`;
            elements.floating.style.maxHeight = `${Math.min(availableHeight, maxHeight)}px`;
          },
        }),
      ],
    }).then(({ x, y, middlewareData }) => {
      floating.style.left = `${x}px`;
      floating.style.top = `${y}px`;
      floating.style.visibility = middlewareData.hide?.referenceHidden
        ? "hidden"
        : "visible";
    });
  });
}
