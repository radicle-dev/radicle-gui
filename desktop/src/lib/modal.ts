import type { Component, ComponentProps } from "svelte";

import { derived, get, writable } from "svelte/store";

import { closeFocused } from "@app/components/Popover.svelte";

type HideCallback = () => void;

type Modal = {
  component: Component;
  props: Record<string, unknown>;
  hideCallback?: HideCallback;
  disableHide?: boolean;
  disableScrimClose?: boolean;
};

const store = writable<Modal | undefined>(undefined);
export const modalStore = derived(store, s => s);

export function enableHide() {
  store.update(s => {
    if (s) {
      return { ...s, disableHide: false };
    }
  });
}

export function disableHide() {
  store.update(s => {
    if (s) {
      return { ...s, disableHide: true };
    }
  });
}

export function forceHide(): void {
  const stored = get(modalStore);
  if (!stored) {
    return;
  }
  if (stored.hideCallback) {
    stored.hideCallback();
  }
  store.set(undefined);
}

export function hide(): void {
  const stored = get(modalStore);
  if (!stored || stored.disableHide) {
    return;
  }

  if (stored.hideCallback) {
    stored.hideCallback();
  }
  store.set(undefined);
}

interface ShowArgs<T extends Component> {
  component: T;
  props: ComponentProps<T>;
  hideCallback?: HideCallback;
  disableScrimClose?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function show<T extends Component<any>>(args: ShowArgs<T>): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  closeFocused();
  store.set({ ...args, disableScrimClose: args.disableScrimClose ?? false });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toggle<T extends Component<any>>(args: ShowArgs<T>): void {
  const stored = get(modalStore);

  if (stored?.disableHide) {
    return;
  }

  if (stored && stored.component === args.component) {
    hide();
    return;
  }

  show(args);
}
