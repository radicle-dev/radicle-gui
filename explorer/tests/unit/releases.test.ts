import type { Artifact } from "@http-client";

import { describe, expect, test } from "vitest";
import {
  artifactView,
  attestedBy,
  redactedByTrusted,
  releaseWarning,
} from "@app/lib/releases";

const delegate = "did:key:z6MkDelegate";
const other = "did:key:z6MkOther";
const delegates = new Set([delegate]);

function artifact(
  cid: string,
  author: string,
  redactedBy: string[] = [],
): Artifact {
  return {
    cid,
    author: { id: author },
    redactions: redactedBy.map(id => ({ user: { id } })),
  } as Artifact;
}

describe("redactedByTrusted", () => {
  test.each([
    { by: [delegate], author: other, expected: true },
    { by: [other], author: other, expected: true },
    { by: [other], author: delegate, expected: false },
    { by: [], author: other, expected: false },
  ])("redacted by $by for $author => $expected", ({ by, author, expected }) => {
    expect(redactedByTrusted(artifact("a", author, by), delegates)).toBe(
      expected,
    );
  });
});

describe("artifactView", () => {
  const ours = artifact("ours", delegate);
  const ourRedacted = artifact("ours-redacted", delegate, [delegate]);
  const theirs = artifact("theirs", other);

  test("splits artifacts into disjoint scopes", () => {
    const all = [ours, theirs];
    expect(artifactView(all, delegates, "trusted", false).shown).toEqual([
      ours,
    ]);
    expect(artifactView(all, delegates, "untrusted", false).shown).toEqual([
      theirs,
    ]);
  });

  test("keeps the asked scope when it is empty", () => {
    const view = artifactView([theirs], delegates, "trusted", false);
    expect(view.shown).toEqual([]);
    expect(view.showFilters).toBe(true);
  });

  test("keeps the filter on others without artifacts by others", () => {
    const view = artifactView([ours], delegates, "untrusted", false);
    expect(view.shown).toEqual([]);
    expect(view.showFilters).toBe(true);
  });

  test("hides the filter without artifacts by others", () => {
    const view = artifactView([ours], delegates, "trusted", false);
    expect(view.showFilters).toBe(false);
  });

  test("hides redacted artifacts unless asked", () => {
    const all = [ours, ourRedacted];
    expect(artifactView(all, delegates, "trusted", false).shown).toEqual([
      ours,
    ]);
    expect(artifactView(all, delegates, "trusted", true).shown).toEqual(all);
  });

  test("counts redacted artifacts in the current scope only", () => {
    const all = [ourRedacted, artifact("x", other, [other])];
    expect(artifactView(all, delegates, "trusted", false).redactedCount).toBe(
      1,
    );
  });

  test("counts only what each scope would show", () => {
    const view = artifactView(
      [ours, ourRedacted, theirs],
      delegates,
      "trusted",
      false,
    );
    expect(view.counts).toEqual({ trusted: 1, untrusted: 1 });
  });

  test("keeps the filter when only redacted artifacts by others exist", () => {
    const view = artifactView(
      [ours, artifact("x", other, [other])],
      delegates,
      "trusted",
      false,
    );
    expect(view.showFilters).toBe(true);
  });

  test("handles a release without artifacts", () => {
    const view = artifactView([], delegates, "trusted", false);
    expect(view).toEqual({
      shown: [],
      redactedCount: 0,
      counts: { trusted: 0, untrusted: 0 },
      showFilters: false,
    });
  });
});

describe("attestedBy", () => {
  test("counts only delegate attestations", () => {
    expect(attestedBy([{ id: delegate }, { id: other }], delegates)).toBe(1);
  });

  test("counts nothing without attestations", () => {
    expect(attestedBy([], delegates)).toBe(0);
  });
});

describe("releaseWarning", () => {
  test.each(["trusted" as const, "untrusted" as const])(
    "warns about a release by a non-delegate in the %s scope",
    scope => {
      expect(releaseWarning(other, delegates, scope)).toBe("release");
    },
  );

  test("warns about others' artifacts on a delegate's release", () => {
    expect(releaseWarning(delegate, delegates, "untrusted")).toBe("artifacts");
  });

  test("trusts a delegate's release with delegate artifacts", () => {
    expect(releaseWarning(delegate, delegates, "trusted")).toBeUndefined();
  });
});
