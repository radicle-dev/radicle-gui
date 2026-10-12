const mirroredProperties = [
  "boxSizing",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderTopWidth",
  "fontFamily",
  "fontSize",
  "fontSizeAdjust",
  "fontStretch",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "tabSize",
  "textIndent",
  "textTransform",
  "wordSpacing",
] as const;

export function caretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");

  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "0";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = "auto";
  for (const property of mirroredProperties) {
    mirror.style[property] = style[property];
  }

  mirror.textContent = textarea.value.slice(0, position).replace(/\n$/, "\n ");

  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const { offsetTop, offsetLeft, offsetHeight } = marker;
  document.body.removeChild(mirror);

  return {
    top: offsetTop,
    left: offsetLeft,
    height: offsetHeight || parseFloat(style.lineHeight) || 0,
  };
}
