/// Pins `rid` at the front of the list, or unpins it if it is already there.
export function togglePinned(list: string[], rid: string): string[] {
  return list.includes(rid) ? list.filter(r => r !== rid) : [rid, ...list];
}

/// The pinned items first, in the order they were pinned, then the rest in
/// their original order.
export function pinnedFirst<T>(
  items: T[],
  pinned: string[],
  ridOf: (item: T) => string,
): T[] {
  return [
    ...pinnedIn(items, pinned, ridOf),
    ...items.filter(item => !pinned.includes(ridOf(item))),
  ];
}

/// The pinned items that are present, in the order they were pinned.
export function pinnedIn<T>(
  items: T[],
  pinned: string[],
  ridOf: (item: T) => string,
): T[] {
  const byRid = new Map(items.map(item => [ridOf(item), item]));
  return pinned
    .map(rid => byRid.get(rid))
    .filter((item): item is T => item !== undefined);
}

/// The inbox's order: pinned repos in pin order, then the others by name, then
/// the hidden ones by name.
export function inboxRepoOrder<T>(
  items: T[],
  pinned: string[],
  hidden: string[],
  ridOf: (item: T) => string,
  nameOf: (item: T) => string,
): T[] {
  const byName = (a: T, b: T) => nameOf(a).localeCompare(nameOf(b));
  return [
    ...pinnedIn(items, pinned, ridOf),
    ...items
      .filter(item => !pinned.includes(ridOf(item)))
      .filter(item => !hidden.includes(ridOf(item)))
      .sort(byName),
    ...items.filter(item => hidden.includes(ridOf(item))).sort(byName),
  ];
}
