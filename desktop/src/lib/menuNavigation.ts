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

export const menuItemSelector = '[role="menuitem"], [role="menuitemcheckbox"]';

// Whether `item` belongs to `menu` itself rather than to a nested submenu.
export function isOwnMenuItem(menu: HTMLElement, item: Element): boolean {
  return item.parentElement?.closest('[role="menu"]') === menu;
}

export function ownMenuItems(menu: HTMLElement | undefined): HTMLElement[] {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLElement>(menuItemSelector),
  ).filter(item => isOwnMenuItem(menu, item));
}

export function focusMenuItem(ev: KeyboardEvent, items: HTMLElement[]) {
  if (items.length === 0) return;
  const current = items.findIndex(el => el === document.activeElement);
  const next = menuFocusIndex(ev.key, current, items.length);
  if (next === undefined) return;
  ev.preventDefault();
  items[next].focus();
}
