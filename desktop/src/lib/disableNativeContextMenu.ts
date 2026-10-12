export function disableNativeContextMenu(): void {
  window.addEventListener("contextmenu", event => {
    const selection = window.getSelection();
    if (
      selection &&
      !selection.isCollapsed &&
      selection.toString().length > 0
    ) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]")) {
      return;
    }
    event.preventDefault();
  });
}
