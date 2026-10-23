import type { ComponentProps } from "svelte";
import type Icon from "@app/components/Icon.svelte";

export interface Toast {
  id: number;
  message: string;
  icon?: ComponentProps<typeof Icon>["name"];
  action?: { label: string; run: () => void };
  // Shows the seconds left next to the action, for undo windows.
  countdown?: boolean;
  deadline: number;
  remaining: number;
  paused: boolean;
}

type ToastOptions = Pick<Toast, "icon" | "action" | "countdown"> & { duration?: number };

const DURATION = 4000;

let next = 0;
const timers: Record<number, ReturnType<typeof setTimeout>> = {};

export const toasts = $state<Toast[]>([]);

export function toast(message: string, { duration = DURATION, ...opts }: ToastOptions = {}) {
  const id = next++;
  toasts.push({ id, message, ...opts, deadline: Date.now() + duration, remaining: duration, paused: false });
  if (toasts.length > 3) dismiss(toasts[0].id);
  timers[id] = setTimeout(() => dismiss(id), duration);
}

export function dismiss(id: number) {
  clearTimeout(timers[id]);
  delete timers[id];
  const i = toasts.findIndex(t => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

export function pause(id: number) {
  const t = toasts.find(t => t.id === id);
  if (!t || t.paused) return;
  clearTimeout(timers[id]);
  t.remaining = Math.max(0, t.deadline - Date.now());
  t.paused = true;
}

export function resume(id: number) {
  const t = toasts.find(t => t.id === id);
  if (!t || !t.paused) return;
  t.deadline = Date.now() + t.remaining;
  t.paused = false;
  timers[id] = setTimeout(() => dismiss(id), t.remaining);
}
