import { beforeAll, describe, expect, test } from "vitest";

import { disableDropNavigation } from "@app/lib/disableDropNavigation";

// happy-dom's DragEvent ignores `dataTransfer`, so it is attached by hand.
function drag(type: "dragover" | "drop", target: Element, types: string[]) {
  const dataTransfer = { types, dropEffect: "copy" };
  const event = new DragEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  target.dispatchEvent(event);
  return {
    prevented: event.defaultPrevented,
    dropEffect: dataTransfer.dropEffect,
  };
}

function element(html: string): Element {
  const template = document.createElement("template");
  template.innerHTML = html;
  const node = template.content.firstElementChild as Element;
  document.body.append(node);
  return node;
}

beforeAll(() => {
  disableDropNavigation();
});

describe("disableDropNavigation", () => {
  test.each([
    ["a link", ["text/uri-list", "text/plain"]],
    ["a file", ["Files"]],
  ])("refuses %s dropped on the page", (_, types) => {
    const page = element("<div>page</div>");
    expect(drag("dragover", page, types)).toEqual({
      prevented: true,
      dropEffect: "none",
    });
    expect(drag("drop", page, types).prevented).toBe(true);
  });

  test.each([
    ["a textarea", "<textarea></textarea>"],
    ["an input", "<input>"],
    ["an editable element", '<div contenteditable="true">x</div>'],
  ])("leaves text dropped into %s to the webview", (_, html) => {
    const field = element(html);
    const types = ["text/plain"];
    expect(drag("dragover", field, types)).toEqual({
      prevented: false,
      dropEffect: "copy",
    });
    expect(drag("drop", field, types).prevented).toBe(false);
  });

  test("refuses text dropped on an element that isn't editable", () => {
    const field = element('<div contenteditable="false">x</div>');
    expect(drag("drop", field, ["text/plain"]).prevented).toBe(true);
  });

  test("refuses a file over a field that didn't accept it", () => {
    const field = element("<textarea></textarea>");
    expect(drag("dragover", field, ["Files"])).toEqual({
      prevented: true,
      dropEffect: "none",
    });
  });

  test("keeps the drop effect of a field that accepted the file", () => {
    const field = element("<div></div>");
    field.addEventListener("dragover", event => event.preventDefault());
    expect(drag("dragover", field, ["Files"])).toEqual({
      prevented: true,
      dropEffect: "copy",
    });
  });
});
