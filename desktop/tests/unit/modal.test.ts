import type { Component } from "svelte";

import { get } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";

import * as modal from "@app/lib/modal";

const First = vi.fn() as unknown as Component;
const Second = vi.fn() as unknown as Component;

afterEach(() => {
  modal.forceHide();
  document.body.replaceChildren();
});

test("show opens the modal with the scrim close enabled by default", () => {
  modal.show({ component: First, props: { a: 1 } });

  expect(get(modal.modalStore)).toEqual({
    component: First,
    props: { a: 1 },
    disableScrimClose: false,
  });

  modal.show({ component: Second, props: {}, disableScrimClose: true });

  expect(get(modal.modalStore)).toMatchObject({
    component: Second,
    disableScrimClose: true,
  });
});

test("show blurs the focused element", () => {
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  expect(document.activeElement).toBe(input);

  modal.show({ component: First, props: {} });

  expect(document.activeElement).not.toBe(input);
});

test("hide closes the modal and runs its hide callback once", () => {
  const hideCallback = vi.fn();
  modal.show({ component: First, props: {}, hideCallback });

  modal.hide();
  modal.hide();

  expect(get(modal.modalStore)).toBeUndefined();
  expect(hideCallback).toHaveBeenCalledTimes(1);
});

test("disableHide keeps the modal open until enableHide", () => {
  const hideCallback = vi.fn();
  modal.show({ component: First, props: {}, hideCallback });
  modal.disableHide();

  modal.hide();
  expect(get(modal.modalStore)).toBeDefined();
  expect(hideCallback).not.toHaveBeenCalled();

  modal.enableHide();
  modal.hide();
  expect(get(modal.modalStore)).toBeUndefined();
  expect(hideCallback).toHaveBeenCalledTimes(1);
});

test("forceHide closes the modal even when hiding is disabled", () => {
  const hideCallback = vi.fn();
  modal.show({ component: First, props: {}, hideCallback });
  modal.disableHide();

  modal.forceHide();
  modal.forceHide();

  expect(get(modal.modalStore)).toBeUndefined();
  expect(hideCallback).toHaveBeenCalledTimes(1);
});

test.each([
  ["enableHide", modal.enableHide],
  ["disableHide", modal.disableHide],
])("%s without a modal leaves it closed", (_, fn) => {
  fn();

  expect(get(modal.modalStore)).toBeUndefined();
});

test("toggle opens, switches and closes the modal", () => {
  modal.toggle({ component: First, props: {} });
  expect(get(modal.modalStore)?.component).toBe(First);

  modal.toggle({ component: Second, props: {} });
  expect(get(modal.modalStore)?.component).toBe(Second);

  modal.toggle({ component: Second, props: {} });
  expect(get(modal.modalStore)).toBeUndefined();
});

test("toggle does nothing while hiding is disabled", () => {
  modal.show({ component: First, props: {} });
  modal.disableHide();

  modal.toggle({ component: Second, props: {} });
  expect(get(modal.modalStore)?.component).toBe(First);

  modal.toggle({ component: First, props: {} });
  expect(get(modal.modalStore)?.component).toBe(First);
});
