import { expect, test, vi } from "vitest";

import { renderAsciidoc } from "@app/lib/asciidoc";

vi.mock("@app/lib/invoke", () => ({ invoke: vi.fn() }));

const source = {
  rid: "rad:z3fpY7nttPPa6MBnAv2DccHzQJnqe",
  sha: "a".repeat(40),
  path: "docs/index.adoc",
};

test.each([
  ["xref:spec.adoc[Spec]", "spec.adoc"],
  ["xref:spec.adoc#_details[Spec]", "spec.adoc#_details"],
  ["<<spec.adoc#,Spec>>", "spec.adoc"],
  ["<<_details,Details>>", "#_details"],
])("links %j to %j", async (content, href) => {
  const html = await renderAsciidoc(content, source);
  expect(html).toContain(`href="${href}"`);
});
