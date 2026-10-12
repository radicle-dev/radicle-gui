export const fontSettings = $state({ size: loadFontSize() });
const step = 2;
const minFontSize = 14;
const maxFontSize = 24;

export function increaseFontSize() {
  if (fontSettings.size + step <= maxFontSize) {
    setFontSize(fontSettings.size + step);
  }
}

export function decreaseFontSize() {
  if (fontSettings.size - step >= minFontSize) {
    setFontSize(fontSettings.size - step);
  }
}

export function resetFontSize() {
  setFontSize(16);
}

function loadFontSize(): number {
  const storedFontSize = localStorage ? localStorage.getItem("fontSize") : "16";

  if (storedFontSize === null) {
    return 16;
  } else {
    return parseInt(storedFontSize);
  }
}

function setFontSize(size: number) {
  fontSettings.size = size;
  localStorage.setItem("fontSize", size.toString());
}
