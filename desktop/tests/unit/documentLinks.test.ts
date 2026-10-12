import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { DocumentLink } from "@app/lib/documentLinks";
import {
  classifyDocumentLink,
  enhanceDocumentLink,
  scrollToFragment,
  scrollToLocationFragment,
} from "@app/lib/documentLinks";

const { show } = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("@app/lib/modal", () => ({ show }));

describe("classifyDocumentLink", () => {
  test.each<[string, string, DocumentLink]>([
    ["docs/guide.md", "README.md", { type: "file", path: "docs/guide.md" }],
    ["./guide.md", "docs/index.md", { type: "file", path: "docs/guide.md" }],
    ["../README.md", "docs/index.md", { type: "file", path: "README.md" }],
    ["/src/main.rs", "docs/index.md", { type: "file", path: "src/main.rs" }],
    ["docs/", "README.md", { type: "file", path: "docs" }],
    [
      "docs/guide.md#usage",
      "README.md",
      { type: "file", path: "docs/guide.md", fragment: "usage" },
    ],
    [
      "guide.md#caf%C3%A9",
      "README.md",
      { type: "file", path: "guide.md", fragment: "café" },
    ],
    ["guide.md?plain=1", "README.md", { type: "file", path: "guide.md" }],
    ["my%20notes.md", "README.md", { type: "file", path: "my notes.md" }],
    ["LICENSE", "", { type: "file", path: "LICENSE" }],
    ["/", "docs/index.md", { type: "file", path: undefined }],
    ["..", "README.md", { type: "file", path: undefined }],
    ["#usage", "README.md", { type: "fragment", id: "usage" }],
    ["#caf%C3%A9", "README.md", { type: "fragment", id: "café" }],
    ["README.md#usage", "README.md", { type: "fragment", id: "usage" }],
    ["README.md#Usage", "README.md", { type: "fragment", id: "Usage" }],
    ["#caf%", "README.md", { type: "fragment", id: "caf%" }],
    ["#", "README.md", { type: "fragment", id: "" }],
    ["", "README.md", { type: "fragment", id: "" }],
    ["https://radicle.xyz", "README.md", { type: "external" }],
    ["HTTP://radicle.xyz", "README.md", { type: "external" }],
    ["mailto:alice@example.com", "README.md", { type: "external" }],
    ["tel:+123", "README.md", { type: "external" }],
    ["ftp://example.com/file", "README.md", { type: "unsupported" }],
    ["javascript:alert(1)", "README.md", { type: "unsupported" }],
    ["//radicle.xyz/notes.md", "README.md", { type: "unsupported" }],
  ])("classifies %j in %j", (href, from, expected) => {
    expect(classifyDocumentLink(href, from)).toEqual(expected);
  });
});

describe("enhanceDocumentLink", () => {
  let container: HTMLElement;

  function link(href: string | undefined): HTMLAnchorElement {
    const anchor = document.createElement("a");
    if (href !== undefined) {
      anchor.setAttribute("href", href);
    }
    anchor.textContent = "link";
    container.appendChild(anchor);
    return anchor;
  }

  function click(anchor: HTMLAnchorElement): MouseEvent {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    show.mockReset();
  });

  test("opens a file in the repository instead of following the link", () => {
    const openFile = vi.fn();
    const anchor = link("../CONTRIBUTING.md");
    enhanceDocumentLink(anchor, () => ({ path: "docs/index.md", openFile }));

    expect(click(anchor).defaultPrevented).toBe(true);
    expect(openFile).toHaveBeenCalledWith("CONTRIBUTING.md", undefined);
    expect(show).not.toHaveBeenCalled();
  });

  test("opens the repository root", () => {
    const openFile = vi.fn();
    const anchor = link("/");
    enhanceDocumentLink(anchor, () => ({ path: "docs/index.md", openFile }));

    expect(click(anchor).defaultPrevented).toBe(true);
    expect(openFile).toHaveBeenCalledWith(undefined, undefined);
  });

  test("resolves against the document shown when the link is followed", () => {
    const openFile = vi.fn();
    let path = "README.md";
    const anchor = link("guide.md");
    enhanceDocumentLink(anchor, () => ({ path, openFile }));

    path = "docs/README.md";
    click(anchor);
    expect(openFile).toHaveBeenCalledWith("docs/guide.md", undefined);
  });

  test("opens a file at the section it links to", () => {
    const openFile = vi.fn();
    const anchor = link("guide.md#Usage");
    enhanceDocumentLink(anchor, () => ({ path: "README.md", openFile }));

    click(anchor);
    expect(openFile).toHaveBeenCalledWith("guide.md", "Usage");
  });

  test("opens external links outside the app", () => {
    const anchor = link("https://radicle.xyz");
    enhanceDocumentLink(anchor, () => ({ path: "README.md" }));

    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toBe("noopener noreferrer");
    expect(anchor.onclick).toBeNull();
  });

  test("scrolls to a fragment in the document", () => {
    const heading = document.createElement("h2");
    heading.id = "usage";
    container.appendChild(heading);
    const scroll = vi
      .spyOn(heading, "scrollIntoView")
      .mockReturnValue(undefined);
    const anchor = link("#usage");
    enhanceDocumentLink(anchor, () => ({ path: "README.md" }));

    expect(click(anchor).defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalled();
  });

  test("scrolls to a named anchor", () => {
    const target = document.createElement("a");
    target.setAttribute("name", "legacy");
    container.appendChild(target);
    const scroll = vi
      .spyOn(target, "scrollIntoView")
      .mockReturnValue(undefined);
    const anchor = link("#legacy");
    enhanceDocumentLink(anchor, () => ({ path: "README.md" }));

    click(anchor);
    expect(scroll).toHaveBeenCalled();
  });

  test("stays put for a missing fragment", () => {
    const anchor = link("#missing");
    enhanceDocumentLink(anchor, () => ({ path: "README.md" }));

    expect(click(anchor).defaultPrevented).toBe(true);
    expect(show).not.toHaveBeenCalled();
  });

  test.each([
    ["ftp://example.com/file", true],
    ["//radicle.xyz/notes.md", true],
    // A document that isn't part of a repository has no files to open.
    ["guide.md", false],
  ])("explains why %j can't be opened", (href, inRepo) => {
    const openFile = vi.fn();
    const anchor = link(href);
    enhanceDocumentLink(anchor, () => ({
      path: "README.md",
      openFile: inRepo ? openFile : undefined,
    }));

    expect(click(anchor).defaultPrevented).toBe(true);
    expect(openFile).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { link: href, reason: "unsupported" },
      }),
    );
  });

  test("leaves anchors without a link alone", () => {
    const anchor = link(undefined);
    enhanceDocumentLink(anchor, () => ({ path: "README.md" }));

    expect(anchor.onclick).toBeNull();
    expect(anchor.target).toBe("");
  });
});

describe("scrollToFragment", () => {
  let container: HTMLElement;

  function target(tag: string, attribute: string, value: string) {
    const element = document.createElement(tag);
    element.setAttribute(attribute, value);
    container.appendChild(element);
    return vi.spyOn(element, "scrollIntoView").mockReturnValue(undefined);
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  test("falls back to the lowercase id of a heading", () => {
    const heading = target("h2", "id", "usage");

    scrollToFragment("Usage");
    expect(heading).toHaveBeenCalled();
  });

  test("prefers an exact match over the lowercase id", () => {
    const heading = target("h2", "id", "usage");
    const anchor = target("a", "name", "Usage");

    scrollToFragment("Usage");
    expect(anchor).toHaveBeenCalled();
    expect(heading).not.toHaveBeenCalled();
  });

  test("scrolls to the location's fragment once per location", () => {
    const heading = target("h2", "id", "café");
    window.history.replaceState(null, "", "/repos#caf%C3%A9");

    const scrolledAt = scrollToLocationFragment(undefined);
    expect(heading).toHaveBeenCalledTimes(1);

    scrollToLocationFragment(scrolledAt);
    expect(heading).toHaveBeenCalledTimes(1);

    window.history.replaceState(null, "", "/other#caf%C3%A9");
    scrollToLocationFragment(scrolledAt);
    expect(heading).toHaveBeenCalledTimes(2);
  });
});
