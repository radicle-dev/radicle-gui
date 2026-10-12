export function menuFocusIndex(
  key: string,
  current: number,
  count: number,
): number | undefined {
  const wrap = (index: number) => ((index % count) + count) % count;
  switch (key) {
    case "ArrowDown":
      return wrap(current + 1);
    case "ArrowUp":
      return current === -1 ? count - 1 : wrap(current - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}
