interface Position {
  x: number;
  y: number;
  id: string;
  target: HTMLElement;
}

export function createListContextMenu<
  T extends { id: string; labels: string[] },
>(items: () => T[]) {
  let position: Position | undefined = $state();

  const current = $derived.by(() => {
    if (!position) return undefined;
    const { id } = position;
    const item = items().find(item => item.id === id);
    return item && { ...position, item };
  });

  const labelSuggestions = $derived(
    items()
      .flatMap(item => item.labels)
      .filter((label, index, all) => all.indexOf(label) === index),
  );

  // The item can drop out of the list after a refresh; forget it so the menu
  // doesn't pop back up if it ever reappears.
  $effect(() => {
    if (position && !current) position = undefined;
  });

  return {
    get current() {
      return current;
    },
    get labelSuggestions() {
      return labelSuggestions;
    },
    isActive(id: string): boolean {
      return current?.item.id === id;
    },
    open(event: MouseEvent, id: string) {
      event.preventDefault();
      position = {
        x: event.clientX,
        y: event.clientY,
        id,
        target: event.currentTarget as HTMLElement,
      };
    },
    close() {
      position = undefined;
    },
  };
}
